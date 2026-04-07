#!/usr/bin/env python3
"""Build and push the combined SQL+Reasoning+Math dataset to HuggingFace Hub.

Creates `Shumatsurontek/neo-sql-reasoning-combined` with 4 configs:
  - combined (default): all 3 sources mixed (50% SQL, 30% Reasoning, 20% Math)
  - sql_only: gretelai/synthetic_text_to_sql
  - reasoning_only: nohurry/Opus-4.6-Reasoning-3000x-filtered
  - math_only: openai/gsm8k

Usage:
    python scripts/build_dataset.py [--hf-token TOKEN] [--dry-run]
"""

from __future__ import annotations

import argparse
import os

from datasets import Dataset, DatasetDict, concatenate_datasets, load_dataset

# ── Constants ──

HF_REPO = "Shumatsurontek/neo-sql-reasoning-combined"

SQL_SYSTEM = (
    "You are a SQL expert. Given a database schema and a natural language "
    "question, generate the correct SQL query."
)
REASONING_SYSTEM = (
    "You are a precise analytical assistant. "
    "Solve the following problem step by step."
)
MATH_SYSTEM = (
    "You are a math tutor. Solve the following grade school math problem "
    "step by step, showing your work."
)

# Proportions: 50/30/20
SQL_TARGET = 5000
REASONING_TARGET = 2100  # ~30% of total (will use all available × ratio)
MATH_TARGET = 1400  # ~20% of total

TEST_RATIO = 0.1  # 10% for test split


# ── Formatters ──


def format_sql(sample: dict) -> dict:
    """Convert synthetic_text_to_sql to chat format."""
    complexity = sample.get("sql_complexity", "basic")
    difficulty_map = {
        "basic": "basic",
        "aggregation": "medium",
        "single join": "medium",
        "multiple_joins": "hard",
        "subqueries": "hard",
        "window functions": "hard",
    }
    return {
        "messages": [
            {"role": "system", "content": SQL_SYSTEM},
            {
                "role": "user",
                "content": (
                    f"Schema:\n{sample['sql_context']}\n\n"
                    f"Question: {sample['sql_prompt']}"
                ),
            },
            {"role": "assistant", "content": sample["sql"]},
        ],
        "source": "sql",
        "difficulty": difficulty_map.get(complexity.lower(), "medium"),
    }


def format_reasoning(sample: dict) -> dict:
    """Convert Opus-4.6-Reasoning to chat format (skip thinking)."""
    difficulty = sample.get("difficulty", "medium")
    return {
        "messages": [
            {"role": "system", "content": REASONING_SYSTEM},
            {"role": "user", "content": sample["problem"]},
            {"role": "assistant", "content": sample["solution"]},
        ],
        "source": "reasoning",
        "difficulty": difficulty.lower() if isinstance(difficulty, str) else "medium",
    }


def format_math(sample: dict) -> dict:
    """Convert GSM8K to chat format."""
    return {
        "messages": [
            {"role": "system", "content": MATH_SYSTEM},
            {"role": "user", "content": sample["question"]},
            {"role": "assistant", "content": sample["answer"]},
        ],
        "source": "math",
        "difficulty": "basic",
    }


# ── Main ──


def build_dataset() -> tuple[Dataset, Dataset, Dataset, Dataset]:
    """Load, format, sample, and combine datasets."""
    print("Loading gretelai/synthetic_text_to_sql...")
    sql_raw = load_dataset("gretelai/synthetic_text_to_sql", split="train")
    sql_ds = sql_raw.shuffle(seed=42).select(range(min(SQL_TARGET, len(sql_raw))))
    sql_ds = sql_ds.map(format_sql, remove_columns=sql_raw.column_names)
    print(f"  SQL: {len(sql_ds)} samples")

    print("Loading nohurry/Opus-4.6-Reasoning-3000x-filtered...")
    reason_raw = load_dataset(
        "nohurry/Opus-4.6-Reasoning-3000x-filtered", split="train"
    )
    reason_count = min(REASONING_TARGET, len(reason_raw))
    reason_ds = reason_raw.shuffle(seed=42).select(range(reason_count))
    reason_ds = reason_ds.map(format_reasoning, remove_columns=reason_raw.column_names)
    print(f"  Reasoning: {len(reason_ds)} samples")

    print("Loading openai/gsm8k...")
    math_raw = load_dataset("openai/gsm8k", "main", split="train")
    math_count = min(MATH_TARGET, len(math_raw))
    math_ds = math_raw.shuffle(seed=42).select(range(math_count))
    math_ds = math_ds.map(format_math, remove_columns=math_raw.column_names)
    print(f"  Math: {len(math_ds)} samples")

    # Combined
    combined = concatenate_datasets([sql_ds, reason_ds, math_ds]).shuffle(seed=42)
    print(f"  Combined: {len(combined)} samples")

    return combined, sql_ds, reason_ds, math_ds


def split_train_test(ds: Dataset) -> DatasetDict:
    """Split into train/test."""
    splits = ds.train_test_split(test_size=TEST_RATIO, seed=42)
    return DatasetDict({"train": splits["train"], "test": splits["test"]})


def push_to_hub(
    combined: Dataset,
    sql_ds: Dataset,
    reason_ds: Dataset,
    math_ds: Dataset,
    token: str,
) -> None:
    """Push all configs to HuggingFace Hub."""
    print(f"\nPushing to {HF_REPO}...")

    print("  Pushing 'combined' (default)...")
    split_train_test(combined).push_to_hub(
        HF_REPO, config_name="combined", token=token, set_default=True
    )

    print("  Pushing 'sql_only'...")
    split_train_test(sql_ds).push_to_hub(
        HF_REPO, config_name="sql_only", token=token
    )

    print("  Pushing 'reasoning_only'...")
    split_train_test(reason_ds).push_to_hub(
        HF_REPO, config_name="reasoning_only", token=token
    )

    print("  Pushing 'math_only'...")
    split_train_test(math_ds).push_to_hub(
        HF_REPO, config_name="math_only", token=token
    )

    print(f"\nDone! Dataset available at: https://huggingface.co/datasets/{HF_REPO}")


DATASET_CARD = f"""\
---
license: apache-2.0
task_categories:
  - text-generation
  - text2text-generation
tags:
  - sql
  - reasoning
  - math
  - sft
  - chat
  - fine-tuning
language:
  - en
pretty_name: Neo SQL + Reasoning Combined
size_categories:
  - 1K<n<10K
---

# Neo SQL + Reasoning Combined Dataset

Combined SFT dataset for fine-tuning SQL, reasoning, and math models.
Built for the [neo-deep-agent-lab](https://github.com/Shumatsurontek/neo-deep-agent-lab) project.

## Sources & Proportions

| Source | Proportion | Records | Focus |
|--------|-----------|---------|-------|
| `gretelai/synthetic_text_to_sql` | 50% | ~5,000 | SQL generation |
| `nohurry/Opus-4.6-Reasoning-3000x-filtered` | 30% | ~2,100 | Reasoning |
| `openai/gsm8k` | 20% | ~1,400 | Math problems |

## Format

All samples are normalized to **SFT chat format**:

```json
{{
  "messages": [
    {{"role": "system", "content": "<task-specific prompt>"}},
    {{"role": "user", "content": "<question>"}},
    {{"role": "assistant", "content": "<answer>"}}
  ],
  "source": "sql|reasoning|math",
  "difficulty": "basic|medium|hard"
}}
```

## Configs

| Config | Description | Default |
|--------|-------------|---------|
| `combined` | All 3 sources mixed and shuffled | Yes |
| `sql_only` | SQL generation only | |
| `reasoning_only` | Analytical reasoning only | |
| `math_only` | Math problems only | |

## Usage

```python
from datasets import load_dataset

# Load default (combined)
ds = load_dataset("{HF_REPO}")

# Load specific config
sql = load_dataset("{HF_REPO}", "sql_only")
math = load_dataset("{HF_REPO}", "math_only")
```

## Training

This dataset is designed for SFT (Supervised Fine-Tuning) with models like:
- **LiquidAI/LFM2.5-350M** (350M params, 32K context)
- **Qwen/Qwen3.5-\\*** (0.8B to 9B)

Best results with LoRA bf16, 3 epochs, lr=2e-4, batch=4.

## License

Apache 2.0 (inherits from source datasets)
"""


def push_dataset_card(token: str) -> None:
    """Push the dataset card README."""
    from huggingface_hub import HfApi

    api = HfApi(token=token)
    api.create_repo(HF_REPO, repo_type="dataset", exist_ok=True)
    api.upload_file(
        path_or_fileobj=DATASET_CARD.encode(),
        path_in_repo="README.md",
        repo_id=HF_REPO,
        repo_type="dataset",
        commit_message="Add dataset card",
    )
    print("Dataset card pushed.")


def main():
    parser = argparse.ArgumentParser(description="Build and push combined dataset")
    parser.add_argument(
        "--hf-token",
        default=os.environ.get("HF_TOKEN", ""),
        help="HuggingFace token (or set HF_TOKEN env var)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Build locally without pushing",
    )
    args = parser.parse_args()

    if not args.hf_token and not args.dry_run:
        print("ERROR: --hf-token required (or set HF_TOKEN env var)")
        raise SystemExit(1)

    combined, sql_ds, reason_ds, math_ds = build_dataset()

    print("\n--- Dataset Summary ---")
    print(f"  Combined: {len(combined)} ({len(combined)} total)")
    print(f"  SQL:       {len(sql_ds)}")
    print(f"  Reasoning: {len(reason_ds)}")
    print(f"  Math:      {len(math_ds)}")

    if args.dry_run:
        print("\n[DRY RUN] Skipping push. Sample:")
        print(combined[0])
        return

    push_dataset_card(args.hf_token)
    push_to_hub(combined, sql_ds, reason_ds, math_ds, args.hf_token)


if __name__ == "__main__":
    main()
