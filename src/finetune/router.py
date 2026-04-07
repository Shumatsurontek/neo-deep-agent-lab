"""FastAPI router for fine-tuning endpoints with SSE streaming."""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from typing import AsyncGenerator

import modal
from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from src.common import get_logger
from src.finetune.config import FineTuneConfig, FineTuneJob, JobStatus
from src.server.session import Session, get_or_create_session

logger = get_logger("finetune.router")

router = APIRouter(prefix="/finetune", tags=["finetune"])

_MODAL_APP_NAME = "neo-deep-finetune"

# ── In-memory job store (session_token → {job_id → job}) ──

_jobs: dict[str, dict[str, FineTuneJob]] = {}

# ── vLLM serving state ──

_serving_url: str | None = None


async def _get_session(
    authorization: str | None = Header(None),
) -> Session:
    """Extract Bearer token and resolve session."""
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    return get_or_create_session(token)


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _get_train_function(model_name: str) -> modal.Function:
    """Look up the correct deployed Modal training function."""
    is_qwen = "Qwen" in model_name or "qwen" in model_name
    func_name = "train_qwen" if is_qwen else "train_generic"
    try:
        return modal.Function.from_name(_MODAL_APP_NAME, func_name)
    except modal.exception.NotFoundError:
        logger.info("Modal app not deployed, deploying now...")
        import subprocess  # noqa: S404

        subprocess.run(  # noqa: S603, S607
            ["modal", "deploy", "src/finetune/modal_app.py"],
            check=True,
            capture_output=True,
        )
        return modal.Function.from_name(_MODAL_APP_NAME, func_name)


def _get_progress_dict() -> modal.Dict:
    """Get handle to the shared progress Dict."""
    return modal.Dict.from_name("finetune-progress", create_if_missing=True)


class StartRequest(BaseModel):
    config: FineTuneConfig = FineTuneConfig()


@router.post("/start")
async def start_finetune(
    req: StartRequest,
    session: Session = Depends(_get_session),
):
    """Start a fine-tuning job. Returns SSE stream with progress."""
    job = FineTuneJob(
        id=str(uuid.uuid4()),
        config=req.config,
        status=JobStatus.QUEUED,
        created_at=time.time(),
    )

    _jobs.setdefault(session.token, {})[job.id] = job

    async def generate() -> AsyncGenerator[str, None]:
        yield _sse(
            {
                "type": "finetune-start",
                "job": job.model_dump(),
                "message": "Job queued, launching GPU...",
            }
        )

        try:
            train_fn = await asyncio.to_thread(
                _get_train_function, req.config.model.value
            )

            job.status = JobStatus.RUNNING
            job.started_at = time.time()

            config_json = job.config.model_dump_json()
            call = await asyncio.to_thread(train_fn.spawn, config_json, job.id)

            progress = await asyncio.to_thread(_get_progress_dict)
            seen = 0

            while True:
                await asyncio.sleep(2)

                try:
                    count = await asyncio.to_thread(
                        progress.get,
                        f"count:{job.id}",
                        default=0,
                    )

                    if count > seen:
                        raw = await asyncio.to_thread(
                            progress.get,
                            f"events:{job.id}",
                            default="[]",
                        )
                        events = json.loads(raw)
                        new_events = events[seen:]
                        seen = count

                        for event in new_events:
                            etype = event.get("type", "")

                            if "step" in event:
                                job.current_step = event["step"]
                            if "total_steps" in event:
                                job.total_steps = event["total_steps"]
                            if event.get("loss") is not None:
                                job.current_loss = event["loss"]

                            yield _sse(event)

                            if etype == "finetune-done":
                                job.status = JobStatus.COMPLETED
                                job.completed_at = time.time()
                                job.model_path = event.get("model_path")
                                return

                            if etype == "finetune-error":
                                job.status = JobStatus.FAILED
                                job.completed_at = time.time()
                                job.error = event.get("message", "Unknown error")
                                return

                except Exception as poll_err:
                    logger.debug("Poll error: %s", poll_err)

                # Check if call finished
                try:
                    await asyncio.to_thread(call.get, timeout=0)
                    if job.status == JobStatus.RUNNING:
                        job.status = JobStatus.COMPLETED
                        job.completed_at = time.time()
                        yield _sse(
                            {
                                "type": "finetune-done",
                                "message": "Training complete",
                            }
                        )
                    return
                except TimeoutError:
                    continue
                except Exception as exc:
                    if job.status == JobStatus.RUNNING:
                        job.status = JobStatus.FAILED
                        job.completed_at = time.time()
                        job.error = str(exc)
                        yield _sse(
                            {
                                "type": "finetune-error",
                                "message": str(exc),
                            }
                        )
                    return

        except Exception as exc:
            logger.exception("Fine-tuning error")
            job.status = JobStatus.FAILED
            job.completed_at = time.time()
            job.error = str(exc)
            yield _sse(
                {
                    "type": "finetune-error",
                    "message": str(exc),
                }
            )

    return StreamingResponse(
        content=generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.post("/cancel/{job_id}")
async def cancel_finetune(
    job_id: str,
    session: Session = Depends(_get_session),
):
    """Cancel a running fine-tuning job."""
    session_jobs = _jobs.get(session.token, {})
    job = session_jobs.get(job_id)
    if not job:
        return {"error": "Job not found"}

    job.status = JobStatus.CANCELLED
    job.completed_at = time.time()
    return {"status": "cancelled", "job_id": job_id}


@router.get("/jobs")
async def list_jobs(
    session: Session = Depends(_get_session),
):
    """List all fine-tuning jobs for the current session."""
    session_jobs = _jobs.get(session.token, {})
    return sorted(
        session_jobs.values(),
        key=lambda j: j.created_at,
        reverse=True,
    )


@router.get("/models")
async def list_models(
    _session: Session = Depends(_get_session),
):
    """List available trained models from the Modal volume."""
    try:
        fn = modal.Function.from_name(_MODAL_APP_NAME, "list_trained_models")
        result = await asyncio.to_thread(fn.remote)
        return json.loads(result)
    except Exception as exc:
        logger.warning("Failed to list models: %s", exc)
        return []


class PushRequest(BaseModel):
    model_path: str
    hf_repo: str
    hf_token: str
    base_model: str = "LiquidAI/LFM2.5-350M"
    dataset: str = "gretelai/synthetic_text_to_sql"


@router.post("/push")
async def push_model(
    req: PushRequest,
    _session: Session = Depends(_get_session),
):
    """Push a trained model from Modal volume to HuggingFace Hub."""
    try:
        fn = modal.Function.from_name(_MODAL_APP_NAME, "push_model_to_hub")
        result = await asyncio.to_thread(
            fn.remote,
            req.model_path,
            req.hf_repo,
            req.hf_token,
            req.base_model,
            req.dataset,
        )
        return {"url": result, "status": "pushed"}
    except Exception as exc:
        logger.exception("Failed to push model")
        return {"error": str(exc)}


class ServeRequest(BaseModel):
    model_path: str = ""


@router.post("/serve")
async def serve_model(
    req: ServeRequest,
    _session: Session = Depends(_get_session),
):
    """Deploy a vLLM inference server for a trained model."""
    global _serving_url
    try:
        # Write selected model path to a marker file in the volume
        # so the vLLM function knows which model to load
        if req.model_path:
            set_fn = modal.Function.from_name(_MODAL_APP_NAME, "set_active_model")
            await asyncio.to_thread(set_fn.remote, req.model_path)

        fn = modal.Function.from_name(_MODAL_APP_NAME, "serve_model")
        url = await asyncio.to_thread(fn.get_web_url)
        _serving_url = url
        return {"url": url, "status": "serving"}
    except Exception as exc:
        logger.exception("Failed to serve model")
        return {"error": str(exc)}


class InferRequest(BaseModel):
    messages: list[dict]
    temperature: float = 0.1
    max_tokens: int = 512


@router.post("/infer")
async def infer(
    req: InferRequest,
    _session: Session = Depends(_get_session),
):
    """Proxy a chat completion request to the vLLM endpoint."""
    if not _serving_url:
        return {"error": "No model serving. Call /finetune/serve first."}

    import httpx

    # vLLM cold start can take several minutes — use generous timeout
    timeout = httpx.Timeout(300.0, connect=60.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{_serving_url}/v1/chat/completions",
                json={
                    "messages": req.messages,
                    "temperature": req.temperature,
                    "max_tokens": req.max_tokens,
                },
            )
            # vLLM may return non-JSON during startup (HTML error)
            if resp.status_code != 200:
                return {
                    "error": (
                        f"vLLM returned status {resp.status_code}. "
                        f"Body: {resp.text[:500]}"
                    )
                }
            try:
                return resp.json()
            except Exception:
                return {
                    "error": (
                        "vLLM returned non-JSON response "
                        "(server may still be starting). "
                        f"Body: {resp.text[:300]}"
                    )
                }
    except httpx.ReadTimeout:
        return {
            "error": (
                "vLLM server timed out. The model may still be "
                "loading (cold start can take 2-5 min). "
                "Try again shortly."
            )
        }
    except httpx.ConnectError:
        return {
            "error": (
                "Cannot connect to vLLM server. It may not be "
                "running yet. Deploy with /finetune/serve and "
                "wait for startup."
            )
        }
    except Exception as exc:
        return {"error": f"Inference error: {exc}"}
