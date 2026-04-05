"""Pydantic models for fine-tuning job configuration and state."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class ModelChoice(str, Enum):
    QWEN3_5_0_8B = "Qwen/Qwen3.5-0.8B"
    QWEN3_5_2B = "Qwen/Qwen3.5-2B"
    QWEN3_5_4B = "Qwen/Qwen3.5-4B"
    QWEN3_5_9B = "Qwen/Qwen3.5-9B"
    LFM2_5_350M = "LiquidAI/LFM2.5-350M"


class GPUChoice(str, Enum):
    L40S = "L40S"
    A100 = "A100-80GB"
    T4 = "T4"


class FineTuneConfig(BaseModel):
    model: ModelChoice = ModelChoice.QWEN3_5_2B
    dataset: str = "gretelai/synthetic_text_to_sql"
    gpu: GPUChoice = GPUChoice.L40S
    num_epochs: int = Field(default=3, ge=1, le=20)
    learning_rate: float = Field(default=2e-4, gt=0, lt=1)
    batch_size: int = Field(default=4, ge=1, le=64)
    max_seq_length: int = Field(default=2048, ge=256, le=8192)
    lora_r: int = Field(default=16, ge=4, le=128)
    lora_alpha: int = Field(default=32, ge=4, le=256)
    dataset_max_samples: int = Field(default=10000, ge=100, le=105000)
    wandb_api_key: str = ""


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class FineTuneJob(BaseModel):
    id: str
    config: FineTuneConfig
    status: JobStatus = JobStatus.QUEUED
    created_at: float
    started_at: float | None = None
    completed_at: float | None = None
    error: str | None = None
    model_path: str | None = None
    current_step: int = 0
    total_steps: int = 0
    current_loss: float | None = None


# Map model choice to whether it uses Unsloth (Qwen) or standard Transformers (LFM)
UNSLOTH_MODELS = {
    ModelChoice.QWEN3_5_0_8B,
    ModelChoice.QWEN3_5_2B,
    ModelChoice.QWEN3_5_4B,
    ModelChoice.QWEN3_5_9B,
}
