"""Storage and similarity search for resolved issues.

Tenant isolation is built into the interface: every read, write and delete
takes `company_id` as a required keyword argument and filters on it. There is
no method that searches across companies.

PgVectorStore is the real implementation (PostgreSQL + pgvector, in the `ai`
schema). InMemoryVectorStore has identical behaviour and is used in tests and
offline evaluations; both pass the same contract tests.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass, replace
from datetime import datetime
from typing import Any, Protocol

from pgvector.psycopg import register_vector_async
from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

# Fail fast on an unreachable host instead of waiting indefinitely
CONNECT_TIMEOUT_SECONDS = 10


@dataclass(frozen=True, slots=True)
class IssueDocument:
    issue_id: int
    company_id: int
    product_id: int
    ticket_number: str
    title: str
    problem: str
    resolution: str
    resolved_at: datetime | None
    embedding_model: str
    # Hash of the embedded text and model; unchanged hash means no re-embedding
    content_hash: str


@dataclass(frozen=True, slots=True)
class SearchHit:
    document: IssueDocument
    similarity: float


class VectorStore(Protocol):
    async def get_content_hash(self, *, company_id: int, issue_id: int) -> str | None: ...

    async def upsert(self, document: IssueDocument, embedding: Sequence[float] | None) -> None:
        """Insert or update. `embedding=None` keeps the stored vector (content unchanged)."""
        ...

    async def delete(self, *, company_id: int, issue_id: int) -> bool: ...

    async def search(
        self,
        *,
        company_id: int,
        embedding: Sequence[float],
        limit: int,
        exclude_issue_id: int | None = None,
        product_ids: Sequence[int] | None = None,
    ) -> list[SearchHit]:
        """`product_ids` narrows the search to the products the viewer may open."""
        ...

    async def list_issue_ids(self, *, company_id: int | None = None) -> list[tuple[int, int]]:
        """(company_id, issue_id) pairs, for reconciling the index with the backend."""
        ...

    async def aclose(self) -> None: ...


def require_company(company_id: int) -> int:
    """Every query is scoped to one company. Refuse anything that isn't a real ID."""
    if isinstance(company_id, bool) or not isinstance(company_id, int) or company_id <= 0:
        raise ValueError("company_id must be a positive integer")
    return company_id


# ─── PostgreSQL + pgvector ───────────────────────────────────────────────────


class PgVectorStore:
    def __init__(self, pool: AsyncConnectionPool[AsyncConnection[Any]]) -> None:
        self._pool = pool

    @classmethod
    async def connect(cls, url: str) -> "PgVectorStore":
        async def configure(conn: AsyncConnection[Any]) -> None:
            await register_vector_async(conn)

        pool: AsyncConnectionPool[AsyncConnection[Any]] = AsyncConnectionPool(
            url,
            min_size=1,
            max_size=4,
            configure=configure,
            kwargs={"connect_timeout": CONNECT_TIMEOUT_SECONDS},
            open=False,
        )
        await pool.open(wait=True, timeout=15)
        return cls(pool)

    async def get_content_hash(self, *, company_id: int, issue_id: int) -> str | None:
        async with self._pool.connection() as conn:
            row = await (
                await conn.execute(
                    "SELECT content_hash FROM ai.issue_documents "
                    "WHERE company_id = %s AND issue_id = %s",
                    (require_company(company_id), issue_id),
                )
            ).fetchone()
        return str(row[0]) if row else None

    async def upsert(self, document: IssueDocument, embedding: Sequence[float] | None) -> None:
        require_company(document.company_id)
        values = {
            "issue_id": document.issue_id,
            "company_id": document.company_id,
            "product_id": document.product_id,
            "ticket_number": document.ticket_number,
            "title": document.title,
            "problem": document.problem,
            "resolution": document.resolution,
            "resolved_at": document.resolved_at,
            "embedding_model": document.embedding_model,
            "content_hash": document.content_hash,
        }
        async with self._pool.connection() as conn:
            if embedding is None:
                # Content unchanged: refresh the stored text, keep the vector
                await conn.execute(
                    "UPDATE ai.issue_documents SET product_id = %(product_id)s, "
                    "ticket_number = %(ticket_number)s, "
                    "title = %(title)s, problem = %(problem)s, resolution = %(resolution)s, "
                    "resolved_at = %(resolved_at)s, indexed_at = now() "
                    "WHERE company_id = %(company_id)s AND issue_id = %(issue_id)s",
                    values,
                )
                return
            await conn.execute(
                "INSERT INTO ai.issue_documents (issue_id, company_id, product_id, ticket_number, "
                "title, problem, resolution, resolved_at, embedding_model, content_hash, "
                "embedding) "
                "VALUES (%(issue_id)s, %(company_id)s, %(product_id)s, %(ticket_number)s, "
                "%(title)s, %(problem)s, %(resolution)s, %(resolved_at)s, %(embedding_model)s, "
                "%(content_hash)s, %(embedding)s) "
                "ON CONFLICT (issue_id) DO UPDATE SET company_id = EXCLUDED.company_id, "
                "product_id = EXCLUDED.product_id, "
                "ticket_number = EXCLUDED.ticket_number, title = EXCLUDED.title, "
                "problem = EXCLUDED.problem, resolution = EXCLUDED.resolution, "
                "resolved_at = EXCLUDED.resolved_at, embedding_model = EXCLUDED.embedding_model, "
                "content_hash = EXCLUDED.content_hash, embedding = EXCLUDED.embedding, "
                "indexed_at = now()",
                {**values, "embedding": list(embedding)},
            )

    async def delete(self, *, company_id: int, issue_id: int) -> bool:
        async with self._pool.connection() as conn:
            cursor = await conn.execute(
                "DELETE FROM ai.issue_documents WHERE company_id = %s AND issue_id = %s",
                (require_company(company_id), issue_id),
            )
            return cursor.rowcount > 0

    async def search(
        self,
        *,
        company_id: int,
        embedding: Sequence[float],
        limit: int,
        exclude_issue_id: int | None = None,
        product_ids: Sequence[int] | None = None,
    ) -> list[SearchHit]:
        # The company filter is part of the SQL itself, so rows from another
        # tenant are never read, let alone returned. <=> is cosine distance.
        async with (
            self._pool.connection() as conn,
            conn.cursor(row_factory=dict_row) as cursor,
        ):
            await cursor.execute(
                "SELECT issue_id, company_id, product_id, ticket_number, title, problem, "
                "resolution, resolved_at, embedding_model, content_hash, "
                "1 - (embedding <=> %(query)s::vector) AS similarity "
                "FROM ai.issue_documents "
                "WHERE company_id = %(company_id)s "
                "AND (%(exclude)s::bigint IS NULL OR issue_id <> %(exclude)s::bigint) "
                "AND (%(products)s::bigint[] IS NULL OR product_id = ANY(%(products)s)) "
                "ORDER BY embedding <=> %(query)s::vector "
                "LIMIT %(limit)s",
                {
                    "query": list(embedding),
                    "company_id": require_company(company_id),
                    "exclude": exclude_issue_id,
                    "products": list(product_ids) if product_ids is not None else None,
                    "limit": limit,
                },
            )
            rows = await cursor.fetchall()
        return [
            SearchHit(
                document=IssueDocument(**{k: v for k, v in row.items() if k != "similarity"}),
                similarity=float(row["similarity"]),
            )
            for row in rows
        ]

    async def list_issue_ids(self, *, company_id: int | None = None) -> list[tuple[int, int]]:
        async with self._pool.connection() as conn:
            if company_id is None:
                cursor = await conn.execute(
                    "SELECT company_id, issue_id FROM ai.issue_documents ORDER BY issue_id"
                )
            else:
                cursor = await conn.execute(
                    "SELECT company_id, issue_id FROM ai.issue_documents "
                    "WHERE company_id = %s ORDER BY issue_id",
                    (require_company(company_id),),
                )
            return [(int(c), int(i)) for c, i in await cursor.fetchall()]

    async def aclose(self) -> None:
        await self._pool.close()


# ─── In-memory ───────────────────────────────────────────────────────────────


class InMemoryVectorStore:
    """Same contract as PgVectorStore, with brute-force cosine similarity."""

    def __init__(self) -> None:
        self._rows: dict[int, tuple[IssueDocument, list[float]]] = {}

    async def get_content_hash(self, *, company_id: int, issue_id: int) -> str | None:
        require_company(company_id)
        row = self._rows.get(issue_id)
        if row is None or row[0].company_id != company_id:
            return None
        return row[0].content_hash

    async def upsert(self, document: IssueDocument, embedding: Sequence[float] | None) -> None:
        require_company(document.company_id)
        if embedding is None:
            existing = self._rows.get(document.issue_id)
            if existing and existing[0].company_id == document.company_id:
                self._rows[document.issue_id] = (document, existing[1])
            return
        self._rows[document.issue_id] = (document, list(embedding))

    async def delete(self, *, company_id: int, issue_id: int) -> bool:
        require_company(company_id)
        row = self._rows.get(issue_id)
        if row is None or row[0].company_id != company_id:
            return False
        del self._rows[issue_id]
        return True

    async def search(
        self,
        *,
        company_id: int,
        embedding: Sequence[float],
        limit: int,
        exclude_issue_id: int | None = None,
        product_ids: Sequence[int] | None = None,
    ) -> list[SearchHit]:
        require_company(company_id)
        allowed = set(product_ids) if product_ids is not None else None
        hits = [
            SearchHit(document=replace(doc), similarity=_cosine(embedding, vector))
            for doc, vector in self._rows.values()
            if doc.company_id == company_id
            and doc.issue_id != exclude_issue_id
            and (allowed is None or doc.product_id in allowed)
        ]
        hits.sort(key=lambda hit: hit.similarity, reverse=True)
        return hits[:limit]

    async def list_issue_ids(self, *, company_id: int | None = None) -> list[tuple[int, int]]:
        if company_id is not None:
            require_company(company_id)
        return sorted(
            (
                (doc.company_id, doc.issue_id)
                for doc, _ in self._rows.values()
                if company_id is None or doc.company_id == company_id
            ),
            key=lambda pair: pair[1],
        )

    async def aclose(self) -> None:
        return None


def _cosine(a: Sequence[float], b: Sequence[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return dot / norm if norm else 0.0
