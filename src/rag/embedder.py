"""OpenAI text-embedding-3-small embedder — direct API, no LangChain wrapper."""

from __future__ import annotations

from openai import AsyncOpenAI

from src.common import get_logger
from src.config import settings

logger = get_logger("rag.embedder")

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


async def embed_texts(
    texts: list[str], model: str = "text-embedding-3-small"
) -> list[list[float]]:
    """Embed a batch of texts using OpenAI text-embedding-3-small.

    Max 2048 inputs per call, max 8191 tokens per input.
    """
    if not texts:
        return []

    client = _get_client()

    # Batch in chunks of 2048
    all_embeddings: list[list[float]] = []
    batch_size = 2048
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        response = await client.embeddings.create(model=model, input=batch)
        all_embeddings.extend(item.embedding for item in response.data)

    logger.info("Embedded %d text(s) with %s", len(texts), model)
    return all_embeddings
