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
    """Convert a dataset sample to SFT chat format.

    Handles both:
    - Pre-formatted datasets (with 'messages' column) → pass through
    - Raw gretelai/synthetic_text_to_sql → convert to chat format
    """
    if "messages" in sample:
        msgs = sample["messages"]
        if isinstance(msgs, str):
            msgs = json.loads(msgs)
        return {"messages": msgs}
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
    .apt_install("git")
    .pip_install(
        "torch==2.8.0",
        "triton>=3.3.0",
        "xformers==0.0.32.post2",
        "datasets>=3.6",
        "accelerate>=1.9",
        "huggingface_hub>=0.34",
        "wandb>=0.21",
        "bitsandbytes",
    )
    .pip_install(
        "unsloth_zoo[base] @ git+https://github.com/unslothai/unsloth-zoo",
        "unsloth[base] @ git+https://github.com/unslothai/unsloth",
    )
    .pip_install(
        "transformers==5.2.0",
        "trl==0.22.2",
    )
    .run_commands(
        "pip install --upgrade --no-deps tokenizers trl==0.22.2 unsloth unsloth_zoo"
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
    timeout=7200,
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
    "huggingface_hub>=0.34",
)


@app.function(
    image=generic_image,
    gpu="L40S",
    timeout=7200,
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
    from transformers import TrainerCallback
    from trl import SFTConfig, SFTTrainer

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

    # Tokenize: apply chat template + tokenize in one step
    # (Unsloth-patched SFTTrainer does not auto-tokenize messages/text columns)
    # Qwen VL processors expect structured content: [{"type":"text","text":"..."}]
    def _to_structured_content(msgs):
        out = []
        for m in msgs:
            content = m["content"]
            if isinstance(content, str):
                content = [{"type": "text", "text": content}]
            out.append({"role": m["role"], "content": content})
        return out

    # For Qwen VL, tokenizer is a processor — get the underlying text tokenizer
    _tok = getattr(tokenizer, "tokenizer", tokenizer)

    def tokenize_sample(sample):
        msgs = _to_structured_content(sample["messages"])
        # Step 1: apply chat template → flat text string
        text = tokenizer.apply_chat_template(
            msgs, tokenize=False, add_generation_prompt=False
        )
        # Step 2: tokenize with the text tokenizer → flat 1D input_ids
        input_ids = _tok.encode(
            text, truncation=True, max_length=config["max_seq_length"]
        )
        return {
            "input_ids": input_ids,
            "attention_mask": [1] * len(input_ids),
        }

    ds = ds.map(tokenize_sample, remove_columns=ds.column_names)

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

    class CheckpointPushCallback(TrainerCallback):
        """Save checkpoint + push to HF at end of each epoch."""

        def __init__(self, tok, cfg):
            self.tok = tok
            self.cfg = cfg
            self.best_loss = float("inf")
            self.patience_counter = 0
            self.patience = 2  # stop after 2 epochs without improvement

        def on_epoch_end(self, args, state, control, model=None, **kw):
            import pathlib

            epoch = int(state.epoch) if state.epoch else 0
            model_name = self.cfg["model"].replace("/", "_")
            ckpt_path = f"/cache/models/{model_name}_{job_id[:8]}_epoch{epoch}"

            _emit(
                job_id,
                {
                    "type": "finetune-progress",
                    "message": f"Saving checkpoint epoch {epoch}...",
                    "step": state.global_step,
                    "total_steps": state.max_steps,
                },
            )

            # Merge + save checkpoint
            merged = (
                model.merge_and_unload()
                if hasattr(model, "merge_and_unload")
                else model
            )
            merged.save_pretrained(ckpt_path)
            self.tok.save_pretrained(ckpt_path)

            # Save metadata
            last_loss = None
            for log in reversed(state.log_history):
                if "loss" in log:
                    last_loss = log["loss"]
                    break

            meta = {
                "base_model": self.cfg["model"],
                "dataset": self.cfg.get("dataset", ""),
                "final_loss": last_loss,
                "total_steps": state.global_step,
                "epochs": epoch,
                "learning_rate": self.cfg.get("learning_rate", 0),
                "lora_r": self.cfg.get("lora_r", 0),
                "lora_alpha": self.cfg.get("lora_alpha", 0),
                "batch_size": self.cfg.get("batch_size", 0),
                "max_seq_length": self.cfg.get("max_seq_length", 0),
            }
            meta_path = pathlib.Path(ckpt_path) / "training_meta.json"
            meta_path.write_text(json.dumps(meta, indent=2))
            cache_vol.commit()

            # Push checkpoint to HF
            hf_token = self.cfg.get("hf_token", "")
            hf_repo = self.cfg.get("hf_repo", "")
            hf_push = self.cfg.get("hf_push")
            should_push = hf_push in (True, "true", "True", "1") if hf_push else False

            if should_push and hf_token and hf_repo:
                from huggingface_hub import HfApi

                _emit(
                    job_id,
                    {
                        "type": "finetune-progress",
                        "message": f"Pushing epoch {epoch} checkpoint to HF...",
                    },
                )
                api = HfApi(token=hf_token)
                api.create_repo(hf_repo, exist_ok=True)
                merged.push_to_hub(hf_repo, token=hf_token)
                self.tok.push_to_hub(hf_repo, token=hf_token)

                # Overwrite default HF card with custom model card
                card = _build_model_card(
                    repo=hf_repo,
                    base_model=self.cfg["model"],
                    dataset=self.cfg.get("dataset", "unknown"),
                    final_loss=last_loss,
                    total_steps=state.global_step,
                    epochs=epoch,
                    lr=self.cfg.get("learning_rate", 0),
                    lora_r=self.cfg.get("lora_r", 0),
                    lora_alpha=self.cfg.get("lora_alpha", 0),
                    batch_size=self.cfg.get("batch_size", 0),
                    max_seq=self.cfg.get("max_seq_length", 0),
                )
                api.upload_file(
                    path_or_fileobj=card.encode(),
                    path_in_repo="README.md",
                    repo_id=hf_repo,
                    commit_message=f"Update model card (epoch {epoch})",
                )

                _emit(
                    job_id,
                    {
                        "type": "finetune-progress",
                        "message": f"Epoch {epoch} pushed to https://huggingface.co/{hf_repo}",
                    },
                )

            # Early stopping: check loss plateau
            if last_loss is not None:
                if last_loss < self.best_loss - 0.001:
                    self.best_loss = last_loss
                    self.patience_counter = 0
                else:
                    self.patience_counter += 1
                    if self.patience_counter >= self.patience:
                        _emit(
                            job_id,
                            {
                                "type": "finetune-progress",
                                "message": f"Early stopping: no improvement for {self.patience} epochs",
                            },
                        )
                        control.should_training_stop = True

    total_steps = (len(ds) // config["batch_size"]) * config["num_epochs"]
    is_unsloth = "Qwen" in config["model"] or "qwen" in config["model"]

    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # Dataset is pre-tokenized (input_ids + attention_mask)
    sft_config = SFTConfig(
        output_dir="/cache/output",
        max_seq_length=config["max_seq_length"],
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
        remove_unused_columns=False,
        seed=3407,
        dataset_num_proc=1,
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=ds,
        args=sft_config,
        callbacks=[ProgressCallback(), CheckpointPushCallback(tokenizer, config)],
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

    final_loss = train_result.training_loss if train_result else None

    # Save training metadata for later push
    import pathlib

    meta = {
        "base_model": config["model"],
        "dataset": config.get("dataset", ""),
        "final_loss": final_loss,
        "total_steps": trainer.state.global_step,
        "epochs": config.get("num_epochs", 0),
        "learning_rate": config.get("learning_rate", 0),
        "lora_r": config.get("lora_r", 0),
        "lora_alpha": config.get("lora_alpha", 0),
        "batch_size": config.get("batch_size", 0),
        "max_seq_length": config.get("max_seq_length", 0),
    }
    meta_path = pathlib.Path(output_path) / "training_meta.json"
    meta_path.write_text(json.dumps(meta, indent=2))
    cache_vol.commit()

    # Push to HuggingFace Hub if configured
    hf_token = config.get("hf_token", "")
    hf_repo = config.get("hf_repo", "")
    hf_push = config.get("hf_push")
    # Handle both bool and string "true"
    should_push = hf_push in (True, "true", "True", "1") if hf_push else False

    tok_status = "set" if hf_token else "empty"
    print(f"[HF Push] push={hf_push}, token={tok_status}, repo={hf_repo}")

    if should_push and hf_token and hf_repo:
        _emit(
            job_id,
            {
                "type": "finetune-progress",
                "message": f"Pushing model to HF: {hf_repo}...",
            },
        )
        from huggingface_hub import HfApi

        api = HfApi(token=hf_token)
        api.create_repo(hf_repo, exist_ok=True)

        # Push model + tokenizer
        merged_model.push_to_hub(hf_repo, token=hf_token)
        tokenizer.push_to_hub(hf_repo, token=hf_token)

        # Generate and push model card
        base_model = config["model"]
        dataset_name = config.get("dataset", "unknown")
        card_content = _build_model_card(
            repo=hf_repo,
            base_model=base_model,
            dataset=dataset_name,
            final_loss=final_loss,
            total_steps=trainer.state.global_step,
            epochs=config.get("num_epochs", 0),
            lr=config.get("learning_rate", 0),
            lora_r=config.get("lora_r", 0),
            lora_alpha=config.get("lora_alpha", 0),
            batch_size=config.get("batch_size", 0),
            max_seq=config.get("max_seq_length", 0),
        )
        api.upload_file(
            path_or_fileobj=card_content.encode(),
            path_in_repo="README.md",
            repo_id=hf_repo,
            commit_message="Add model card",
        )

        _emit(
            job_id,
            {
                "type": "finetune-progress",
                "message": f"Pushed to https://huggingface.co/{hf_repo}",
            },
        )
    elif hf_token and hf_repo and not should_push:
        print("[HF Push] Push disabled (hf_push is false)")
    elif should_push:
        t = "set" if hf_token else "EMPTY"
        r = hf_repo or "EMPTY"
        print(f"[HF Push] Missing: token={t}, repo={r}")

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


def _build_model_card(  # noqa: PLR0913
    repo: str,
    base_model: str,
    dataset: str,
    final_loss: float | None,
    total_steps: int,
    epochs: int,
    lr: float,
    lora_r: int,
    lora_alpha: int,
    batch_size: int,
    max_seq: int,
) -> str:
    """Generate a HuggingFace model card."""
    name = repo.split("/")[-1]
    L = f"{final_loss:.4f}" if final_loss else "—"  # noqa: N806
    lr_s = f"{lr:.0e}" if lr else "—"
    scaling = f"α/r = {lora_alpha}/{lora_r}" if lora_r else "—"
    is_qwen = "Qwen" in base_model or "qwen" in base_model
    engine = "Unsloth" if is_qwen else "HuggingFace Transformers + PEFT"

    unsloth_tag = "\n  - unsloth" if is_qwen else ""

    return f"""\
---
license: apache-2.0
base_model: {base_model}
datasets:
  - {dataset}
tags:
  - sql
  - text-to-sql
  - fine-tuned
  - lora
  - sft
  - trl{unsloth_tag}
  - neo-deep-agent-lab
  - modal
language:
  - en
pipeline_tag: text-generation
library_name: transformers
model-index:
  - name: {name}
    results:
      - task:
          type: text-generation
          name: Text-to-SQL
        dataset:
          name: {dataset}
          type: {dataset}
        metrics:
          - name: Training Loss
            type: loss
            value: {L}
---

<div align="center">

# {name}

**{base_model}** fine-tuned for **Text-to-SQL** generation via LoRA SFT

[![Built with neo-deep-agent-lab](https://img.shields.io/badge/built%20with-neo--deep--agent--lab-blue)](https://github.com/Shumatsurontek/neo-deep-agent-lab)
[![Modal](https://img.shields.io/badge/infra-Modal-purple)](https://modal.com)
[![Dataset](https://img.shields.io/badge/dataset-{dataset.replace("/", "%2F")}-yellow)](https://huggingface.co/datasets/{dataset})

</div>

---

## Overview

This model was fine-tuned from [`{base_model}`](https://huggingface.co/{base_model}) on the
[`{dataset}`](https://huggingface.co/datasets/{dataset}) dataset using **Supervised Fine-Tuning (SFT)**
with **LoRA** adapters (merged into base weights for easy deployment).

- **Developed by:** [Shumatsurontek](https://github.com/Shumatsurontek)
- **Fine-tuning pipeline:** [neo-deep-agent-lab](https://github.com/Shumatsurontek/neo-deep-agent-lab)
- **Engine:** {engine}
- **Compute:** NVIDIA L40S on [Modal](https://modal.com) serverless GPUs
- **Precision:** bf16
- **License:** Apache 2.0

## Training Details

### Configuration

| Parameter | Value |
|---|---|
| Base model | `{base_model}` |
| Method | SFT + LoRA (bf16, merged) |
| Learning rate | {lr_s} (cosine schedule, 5% warmup) |
| LoRA rank (r) | {lora_r} |
| LoRA alpha | {lora_alpha} ({scaling}) |
| Batch size | {batch_size} per GPU |
| Max sequence length | {max_seq} |
| Epochs | {epochs} |

### Results

| Metric | Value |
|---|---|
| **Final training loss** | **{L}** |
| Total optimization steps | {total_steps:,} |
| Optimizer | {"AdamW 8-bit" if is_qwen else "AdamW"} |

## Dataset

[`{dataset}`](https://huggingface.co/datasets/{dataset})

Each sample follows a 3-turn chat format:

```
System: You are a SQL expert. Given a database schema and a
        natural language question, generate the correct SQL query.
User:   Schema: CREATE TABLE orders (id INT, total DECIMAL);
        Question: What is the total revenue?
Assistant: SELECT SUM(total) FROM orders;
```

## Quickstart

### Transformers

```python
from transformers import AutoModelForCausalLM, AutoTokenizer

model = AutoModelForCausalLM.from_pretrained("{repo}")
tokenizer = AutoTokenizer.from_pretrained("{repo}")

messages = [
    {{"role": "system", "content": "You are a SQL expert. Given a database schema and a natural language question, generate the correct SQL query."}},
    {{"role": "user", "content": "Schema: CREATE TABLE orders (id INT, user_id INT, total DECIMAL);\\nQuestion: Total revenue per user?"}},
]

text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
inputs = tokenizer(text, return_tensors="pt").to(model.device)
output = model.generate(**inputs, max_new_tokens=256)
print(tokenizer.decode(output[0], skip_special_tokens=True))
```

### vLLM (OpenAI-compatible server)

```bash
vllm serve {repo} --trust-remote-code
```

```bash
curl http://localhost:8000/v1/chat/completions -H "Content-Type: application/json" -d '{{
  "model": "{repo}",
  "messages": [
    {{"role": "system", "content": "You are a SQL expert."}},
    {{"role": "user", "content": "Schema: CREATE TABLE users (id INT, name TEXT);\\nQuestion: List all users?"}}
  ]
}}'
```

## Intended Use

This model is designed for **text-to-SQL** tasks: given a database schema and a natural-language question,
it generates the corresponding SQL query. Best suited for analytical and read-only queries.

**Out of scope:** DDL/DML generation (CREATE, DROP, INSERT, UPDATE, DELETE), multi-database queries,
or production use without human review of generated SQL.

## Citation

```bibtex
@misc{{{name.replace("-", "_")},
  title  = {{{name}}},
  author = {{Shumatsurontek}},
  year   = {{2026}},
  url    = {{https://huggingface.co/{repo}}}
}}
```

## License

Apache 2.0
"""


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
    timeout=600,
)
def push_model_to_hub(
    model_path: str,
    hf_repo: str,
    hf_token: str,
    base_model: str = "LiquidAI/LFM2.5-350M",
    dataset: str = "gretelai/synthetic_text_to_sql",
) -> str:
    """Push an already-trained model from the cache volume to HF."""
    import pathlib

    from huggingface_hub import HfApi
    from transformers import AutoModelForCausalLM, AutoTokenizer

    path = pathlib.Path(model_path)
    if not path.exists():
        return f"ERROR: {model_path} not found in volume"

    # Read training metadata if available
    meta_file = path / "training_meta.json"
    if meta_file.exists():
        meta = json.loads(meta_file.read_text())
        base_model = meta.get("base_model", base_model)
        dataset = meta.get("dataset", dataset)
    else:
        meta = {}

    print(f"Loading model from {model_path}...")
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    model = AutoModelForCausalLM.from_pretrained(model_path)

    print(f"Pushing to {hf_repo}...")
    api = HfApi(token=hf_token)
    api.create_repo(hf_repo, exist_ok=True)
    model.push_to_hub(hf_repo, token=hf_token)
    tokenizer.push_to_hub(hf_repo, token=hf_token)

    # Generate rich model card from training metadata
    card = _build_model_card(
        repo=hf_repo,
        base_model=base_model,
        dataset=dataset,
        final_loss=meta.get("final_loss"),
        total_steps=meta.get("total_steps", 0),
        epochs=meta.get("epochs", 0),
        lr=meta.get("learning_rate", 0),
        lora_r=meta.get("lora_r", 0),
        lora_alpha=meta.get("lora_alpha", 0),
        batch_size=meta.get("batch_size", 0),
        max_seq=meta.get("max_seq_length", 0),
    )
    api.upload_file(
        path_or_fileobj=card.encode(),
        path_in_repo="README.md",
        repo_id=hf_repo,
        commit_message="Add model card",
    )

    print(f"Done! https://huggingface.co/{hf_repo}")
    return f"https://huggingface.co/{hf_repo}"


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
