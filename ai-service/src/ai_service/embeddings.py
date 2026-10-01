"""Text embeddings behind a small interface.

FastEmbedder runs a local ONNX model (no API key, no per-call cost, fully
reproducible). FakeEmbedder is a deterministic stand-in for tests: it hashes
words into a vector, so texts sharing words still score as similar.
"""

import asyncio
import hashlib
import math
import re
from typing import Protocol

DIMENSIONS = 384  # bge-small-en-v1.5; the database column has the same size


class Embedder(Protocol):
    model: str

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """One unit-length vector per text."""
        ...


class FastEmbedder:
    def __init__(self, model: str, cache_dir: str | None = None) -> None:
        # Imported here so tests and the fake don't pay for loading onnxruntime
        from fastembed import TextEmbedding

        self.model = model
        self._model = TextEmbedding(model, cache_dir=cache_dir)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        # CPU-bound: run off the event loop so other requests aren't blocked
        return await asyncio.to_thread(
            lambda: [vector.tolist() for vector in self._model.embed(texts)]
        )


_WORD = re.compile(r"[a-z0-9]+")


class FakeEmbedder:
    model = "fake-hashed-bag-of-words"

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(text) for text in texts]

    @staticmethod
    def _embed_one(text: str) -> list[float]:
        vector = [0.0] * DIMENSIONS
        for word in _WORD.findall(text.lower()):
            digest = hashlib.sha256(word.encode()).digest()
            vector[int.from_bytes(digest[:4], "big") % DIMENSIONS] += 1.0
        norm = math.sqrt(sum(v * v for v in vector)) or 1.0
        return [v / norm for v in vector]
