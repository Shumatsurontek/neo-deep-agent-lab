"""Modal functions for fine-tuning (Unsloth + generic) and vLLM inference."""

from __future__ import annotations

import json
import os

import modal

app = modal.App("neo-deep-finetune")

# ── Shared volume for model/dataset caching ──

cache_vol = modal.Volume.from_name("finetune-cache", create_if_missing=True)

# ── Shared Dict for streaming progress from worker → server ──

progress_dict = modal.Dict.from_name("finetune-progress", create_if_missing=True)

SYSTEM_PROMPT = (
    "You are a SQL expert. Given a database schema and a natural language "
    "question, generate the correct SQL query."
)


def format_sample(sample: dict) -> dict:
    """Convert a synthetic_text_to_sql sample to SFT chat format."""
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Schema:\n{sample['sql_context']}\n\n"
                    f"Question: {sample['sql_prompt']}"
                ),
            },
            {"role": "assistant", "content": sample["sql"]},
        ]
    }


def _emit(job_id: str, event: dict) -> None:
    """Append a progress event to the shared dict for the given job."""
    key = f"events:{job_id}"
    existing = progress_dict.get(key, default="[]")
    events = json.loads(existing)
    events.append(event)
    progress_dict[key] = json.dumps(events)
    progress_dict[f"count:{job_id}"] = len(events)


# ═══════════════════════════════════════════════════════════════════
# Image A: Unsloth — for Qwen models (pinned versions from official example)
# ═══════════════════════════════════════════════════════════════════

unsloth_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "accelerate==1.9.0",
        "datasets==3.6.0",
        "hf-transfer==0.1.9",
        "huggingface_hub==0.34.2",
        "peft==0.16.0",
        "transformers==4.54.0",
        "trl==0.19.1",
        "unsloth[cu128-torch270]==2025.7.8",
        "unsloth_zoo==2025.7.10",
        "wandb==0.21.0",
    )
    .env({"HF_HOME": "/cache"})
)

# Unsloth MUST be imported before trl/transformers at module level
with unsloth_image.imports():
    import datasets  # noqa: F401
    import torch  # noqa: F401
    import unsloth  # noqa: F401, I001 — must be first!
    import wandb  # noqa: F401
    from transformers import TrainerCallback, TrainingArguments  # noqa: F401
    from trl import SFTTrainer  # noqa: F401
    from unsloth import FastLanguageModel  # noqa: F401


@app.function(
    image=unsloth_image,
    gpu="L40S",
    timeout=3600,
    volumes={"/cache": cache_vol},
)
def train_qwen(config_json: str, job_id: str) -> str:
    """Fine-tune a Qwen model using Unsloth + LoRA."""
    config = json.loads(config_json)
    model_name = config["model"]

    # W&B setup
    report_to = "none"
    wandb_key = config.get("wandb_api_key", "")
    if wandb_key:
        os.environ["WANDB_API_KEY"] = wandb_key
        wandb.init(
            project="neo-deep-finetune",
            name=f"qwen-{job_id[:8]}",
            config=config,
        )
        report_to = "wandb"

    _emit(
        job_id,
        {
            "type": "finetune-progress",
            "message": f"Loading model {model_name} (Unsloth)...",
            "step": 0,
            "total_steps": 0,
        },
    )

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=model_name,
        max_seq_length=config["max_seq_length"],
        load_in_4bit=False,
        load_in_16bit=True,
        full_finetuning=False,
    )

    model = FastLanguageModel.get_peft_model(
        model,
        r=config["lora_r"],
        lora_alpha=config["lora_alpha"],
        target_modules=[
            "q_proj",
            "k_proj",
            "v_proj",
            "o_proj",
            "gate_proj",
            "up_proj",
            "down_proj",
        ],
        lora_dropout=0,
        bias="none",
        use_gradient_checkpointing="unsloth",
    )

    return _run_training(config, model, tokenizer, job_id, report_to)


# ═══════════════════════════════════════════════════════════════════
# Image B: Generic — for LFM and other models (current working setup)
# ═══════════════════════════════════════════════════════════════════

generic_image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "datasets",
    "trl>=0.12",
    "peft",
    "accelerate",
    "transformers>=5.0",
    "torch",
    "bitsandbytes",
    "wandb",
)


@app.function(
    image=generic_image,
    gpu="L40S",
    timeout=3600,
    volumes={"/cache": cache_vol},
)
def train_generic(config_json: str, job_id: str) -> str:
    """Fine-tune a generic model using Transformers + PEFT LoRA."""
    import torch
    from peft import LoraConfig, get_peft_model
    from transformers import AutoModelForCausalLM, AutoTokenizer

    config = json.loads(config_json)
    model_name = config["model"]

    # W&B setup
    import wandb as wb

    report_to = "none"
    wandb_key = config.get("wandb_api_key", "")
    if wandb_key:
        os.environ["WANDB_API_KEY"] = wandb_key
        wb.init(
            project="neo-deep-finetune",
            name=f"generic-{job_id[:8]}",
            config=config,
        )
        report_to = "wandb"

    _emit(
        job_id,
        {
            "type": "finetune-progress",
            "message": f"Loading model {model_name} (Transformers)...",
            "step": 0,
            "total_steps": 0,
        },
    )

    tokenizer = AutoTokenizer.from_pretrained(model_name, cache_dir="/cache")
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        torch_dtype=torch.bfloat16,
        device_map="auto",
        cache_dir="/cache",
    )

    lora_config = LoraConfig(
        r=config["lora_r"],
        lora_alpha=config["lora_alpha"],
        target_modules=["q_proj", "v_proj"],
        lora_dropout=0,
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora_config)

    return _run_training(config, model, tokenizer, job_id, report_to)


# ═══════════════════════════════════════════════════════════════════
# Shared training loop (used by both train_qwen and train_generic)
# ═══════════════════════════════════════════════════════════════════


def _run_training(config, model, tokenizer, job_id, report_to):
    """Shared SFT training logic."""
    from datasets import load_dataset
    from transformers import TrainerCallback, TrainingArguments
    from trl import SFTTrainer

    _emit(
        job_id,
        {
            "type": "finetune-progress",
            "message": "Loading dataset...",
            "step": 0,
            "total_steps": 0,
        },
    )

    ds = load_dataset(config["dataset"], split="train", cache_dir="/cache")
    max_samples = min(config["dataset_max_samples"], len(ds))
    ds = ds.shuffle(seed=42).select(range(max_samples))
    ds = ds.map(format_sample, remove_columns=ds.column_names)

    class ProgressCallback(TrainerCallback):
        def on_log(self, args, state, control, logs=None, **kwargs):
            loss = logs.get("loss") if logs else None
            lr = logs.get("learning_rate") if logs else None
            _emit(
                job_id,
                {
                    "type": "finetune-progress",
                    "step": state.global_step,
                    "total_steps": state.max_steps,
                    "loss": loss,
                    "learning_rate": lr,
                    "epoch": (round(state.epoch, 2) if state.epoch else None),
                    "message": (f"Step {state.global_step}/{state.max_steps}"),
                },
            )

        def on_evaluate(self, args, state, control, metrics=None, **kw):
            val_loss = metrics.get("eval_loss") if metrics else None
            msg = (
                f"Validation loss: {val_loss:.4f}"
                if val_loss
                else "Validation complete"
            )
            _emit(
                job_id,
                {
                    "type": "finetune-validation",
                    "val_loss": val_loss,
                    "epoch": (round(state.epoch, 2) if state.epoch else None),
                    "step": state.global_step,
                    "message": msg,
                },
            )

    total_steps = (len(ds) // config["batch_size"]) * config["num_epochs"]
    is_unsloth = config["model"].startswith("Qwen/")

    training_args = TrainingArguments(
        output_dir="/cache/output",
        num_train_epochs=config["num_epochs"],
        per_device_train_batch_size=config["batch_size"],
        learning_rate=config["learning_rate"],
        bf16=True,
        logging_steps=max(1, total_steps // 50),
        save_strategy="no",
        report_to=report_to,
        warmup_ratio=0.05,
        lr_scheduler_type="cosine",
        optim="adamw_8bit" if is_unsloth else "adamw_torch",
    )

    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=ds,
        processing_class=tokenizer,
        callbacks=[ProgressCallback()],
    )

    _emit(
        job_id,
        {
            "type": "finetune-progress",
            "step": 0,
            "total_steps": total_steps,
            "message": "Training started...",
        },
    )

    train_result = trainer.train()

    # ── Save model ──

    _emit(
        job_id,
        {
            "type": "finetune-saving",
            "message": "Saving model...",
        },
    )

    # Merge LoRA adapters into base model for vLLM-compatible checkpoint
    # merge_and_unload() fuses the low-rank weights into the base weights
    # and produces a standalone model with config.json (required by vLLM)
    merged_model = trainer.model.merge_and_unload()

    model_name = config["model"].replace("/", "_")
    output_path = f"/cache/models/{model_name}_{job_id[:8]}"
    merged_model.save_pretrained(output_path)
    tokenizer.save_pretrained(output_path)
    cache_vol.commit()

    final_loss = train_result.training_loss if train_result else None

    # Finish W&B
    if report_to == "wandb":
        import wandb as wb

        wb.finish()

    _emit(
        job_id,
        {
            "type": "finetune-done",
            "model_path": output_path,
            "final_loss": final_loss,
            "total_steps": trainer.state.global_step,
            "message": f"Training complete. Saved to {output_path}",
        },
    )

    return json.dumps(
        {
            "model_path": output_path,
            "final_loss": final_loss,
            "total_steps": trainer.state.global_step,
        }
    )


# ═══════════════════════════════════════════════════════════════════
# vLLM inference server
# ═══════════════════════════════════════════════════════════════════

VLLM_PORT = 8000

vllm_image = (
    modal.Image.from_registry("nvidia/cuda:12.9.0-devel-ubuntu22.04", add_python="3.12")
    .entrypoint([])
    .uv_pip_install("vllm==0.19.0")
    .uv_pip_install("transformers==5.5.0")
)


ACTIVE_MODEL_MARKER = "/cache/.active_model"


@app.function(
    image=generic_image,
    volumes={"/cache": cache_vol},
    timeout=30,
)
def set_active_model(model_path: str) -> str:
    """Write a marker file so serve_model knows which model to load."""
    import pathlib

    pathlib.Path(ACTIVE_MODEL_MARKER).write_text(model_path)
    cache_vol.commit()
    return model_path


@app.function(
    image=vllm_image,
    gpu="L40S",
    volumes={"/cache": cache_vol},
    timeout=10 * 60,
    scaledown_window=15 * 60,
)
@modal.concurrent(max_inputs=32)
@modal.web_server(port=VLLM_PORT, startup_timeout=10 * 60)
def serve_model():
    """Serve the selected model via vLLM (OpenAI-compatible)."""
    import pathlib
    import subprocess  # noqa: S404

    # Read selected model from marker file
    marker = pathlib.Path(ACTIVE_MODEL_MARKER)
    if marker.exists():
        model_path = marker.read_text().strip()
        if pathlib.Path(model_path).exists():
            print(f"Serving selected model: {model_path}")
        else:
            print(f"Marker path {model_path} not found, falling back")
            model_path = _find_latest_model()
    else:
        model_path = _find_latest_model()

    cmd = " ".join(
        [
            "vllm",
            "serve",
            model_path,
            "--host",
            "0.0.0.0",
            "--port",
            str(VLLM_PORT),
            "--trust-remote-code",
            "--uvicorn-log-level=info",
        ]
    )
    subprocess.Popen(cmd, shell=True)  # noqa: S602, S603


def _find_latest_model() -> str:
    """Fallback: find the newest model directory."""
    import pathlib

    models_dir = pathlib.Path("/cache/models")
    if not models_dir.exists():
        raise FileNotFoundError("No models directory found")

    model_dirs = [
        d for d in models_dir.iterdir() if d.is_dir() and not d.name.startswith(".")
    ]
    if not model_dirs:
        raise FileNotFoundError("No trained models in /cache/models")

    latest = max(model_dirs, key=lambda d: d.stat().st_mtime)
    print(f"Serving latest model: {latest}")
    return str(latest)


@app.function(
    image=vllm_image,
    volumes={"/cache": cache_vol},
    timeout=30,
)
def list_trained_models() -> str:
    """List all trained model directories in the cache volume."""
    import pathlib

    models_dir = pathlib.Path("/cache/models")
    if not models_dir.exists():
        return json.dumps([])

    models = []
    for d in sorted(
        models_dir.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True
    ):
        if d.is_dir() and not d.name.startswith("."):
            models.append(
                {
                    "name": d.name,
                    "path": str(d),
                    "size_mb": sum(
                        f.stat().st_size for f in d.rglob("*") if f.is_file()
                    )
                    // (1024 * 1024),
                }
            )
    return json.dumps(models)
