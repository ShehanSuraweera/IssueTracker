import math

import pytest

from ai_service.embeddings import DIMENSIONS, FakeEmbedder


async def test_fake_embedder_is_deterministic_and_normalised() -> None:
    embedder = FakeEmbedder()
    [a1, a2, b] = await embedder.embed(["push notifications", "push notifications", "invoices"])
    assert a1 == a2
    assert len(a1) == DIMENSIONS
    assert math.isclose(math.sqrt(sum(v * v for v in a1)), 1.0)
    assert a1 != b


@pytest.mark.embedding
async def test_real_model_ranks_the_same_problem_above_the_threshold() -> None:
    """Loads bge-small-en-v1.5 (downloads ~67 MB on first run).
    Run with: uv run pytest -m embedding"""
    from ai_service.embeddings import FastEmbedder

    embedder = FastEmbedder("BAAI/bge-small-en-v1.5")
    query, same, other = await embedder.embed(
        [
            "Rent reminders not arriving on iPhones since the last update.",
            "Push notifications not received on iOS 17, including rent reminders.",
            "Wrong currency symbol shown for INR property listings.",
        ]
    )

    def cosine(a: list[float], b: list[float]) -> float:
        return sum(x * y for x, y in zip(a, b, strict=True))

    assert len(query) == DIMENSIONS
    assert cosine(query, same) > 0.70 > cosine(query, other)
