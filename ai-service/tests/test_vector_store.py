"""One contract, two implementations: in-memory and PostgreSQL + pgvector.

Every test runs against both stores, so the in-memory store used by tests and
offline evals is guaranteed to behave like production, including the
tenant isolation rules.
"""

from collections.abc import AsyncIterator
from datetime import UTC, datetime

import pytest

from ai_service.embeddings import FakeEmbedder
from ai_service.vector_store import InMemoryVectorStore, IssueDocument, VectorStore
from tests.conftest import open_clean_pg_store

embedder = FakeEmbedder()


@pytest.fixture(params=["memory", pytest.param("postgres", marks=pytest.mark.db)])
async def store(request: pytest.FixtureRequest) -> AsyncIterator[VectorStore]:
    if request.param == "memory":
        yield InMemoryVectorStore()
        return
    # pg_urls is a synchronous fixture, so it's safe to request dynamically
    pg = await open_clean_pg_store(request.getfixturevalue("pg_urls"))
    try:
        yield pg
    finally:
        await pg.aclose()


def doc(
    issue_id: int, company_id: int, title: str, problem: str = "", **extra: object
) -> IssueDocument:
    values: dict[str, object] = {
        "issue_id": issue_id,
        "company_id": company_id,
        # Invalid company IDs are passed through untouched for the store to reject
        "product_id": company_id * 100 + 1 if type(company_id) is int else 1,
        "ticket_number": f"T{company_id}-{issue_id:04d}",
        "title": title,
        "problem": problem or title,
        "resolution": "Fixed it.",
        "resolved_at": datetime(2026, 9, 1, tzinfo=UTC),
        "embedding_model": embedder.model,
        "content_hash": f"hash-{issue_id}",
        **extra,
    }
    return IssueDocument(**values)  # type: ignore[arg-type]


async def vec(text: str) -> list[float]:
    return (await embedder.embed([text]))[0]


async def add(store: VectorStore, document: IssueDocument) -> None:
    await store.upsert(document, await vec(document.title + " " + document.problem))


async def test_finds_the_most_similar_document_first(store: VectorStore) -> None:
    await add(store, doc(1, 10, "push notifications missing on ios"))
    await add(store, doc(2, 10, "invoice pdf export is blank"))
    await add(store, doc(3, 10, "currency symbol wrong on listings"))

    hits = await store.search(company_id=10, embedding=await vec("ios push notifications"), limit=3)
    assert hits[0].document.issue_id == 1
    assert hits[0].similarity > hits[1].similarity
    assert hits[0].document.ticket_number == "T10-0001"
    assert hits[0].document.resolution == "Fixed it."


async def test_search_never_returns_another_companys_documents(store: VectorStore) -> None:
    # Identical text in both companies: only the filter can separate them
    text = "push notifications missing on ios"
    await add(store, doc(1, 10, text))
    await add(store, doc(2, 20, text))
    await add(store, doc(3, 20, text + " again"))

    company_10 = await store.search(company_id=10, embedding=await vec(text), limit=10)
    company_20 = await store.search(company_id=20, embedding=await vec(text), limit=10)
    assert {h.document.issue_id for h in company_10} == {1}
    assert {h.document.issue_id for h in company_20} == {2, 3}
    assert all(h.document.company_id == 10 for h in company_10)


async def test_search_can_be_narrowed_to_the_viewers_products(store: VectorStore) -> None:
    # Same company, two products. An engineer with access to only one of them
    # must never be shown issues from the other.
    text = "push notifications missing"
    await add(store, doc(1, 10, text, product_id=1001))
    await add(store, doc(2, 10, text, product_id=1002))

    everything = await store.search(company_id=10, embedding=await vec(text), limit=10)
    narrowed = await store.search(
        company_id=10, embedding=await vec(text), limit=10, product_ids=[1002]
    )
    assert {h.document.issue_id for h in everything} == {1, 2}
    assert [h.document.issue_id for h in narrowed] == [2]
    # A product of another company doesn't widen the search beyond the company
    other = await store.search(
        company_id=20, embedding=await vec(text), limit=10, product_ids=[1001]
    )
    assert other == []


async def test_search_can_exclude_the_issue_being_viewed(store: VectorStore) -> None:
    await add(store, doc(1, 10, "push notifications missing"))
    await add(store, doc(2, 10, "push notifications delayed"))
    hits = await store.search(
        company_id=10, embedding=await vec("push notifications"), limit=5, exclude_issue_id=1
    )
    assert [h.document.issue_id for h in hits] == [2]


async def test_search_respects_the_limit(store: VectorStore) -> None:
    for i in range(1, 8):
        await add(store, doc(i, 10, f"notification problem number {i}"))
    hits = await store.search(company_id=10, embedding=await vec("notification problem"), limit=3)
    assert len(hits) == 3


async def test_delete_only_works_for_the_owning_company(store: VectorStore) -> None:
    await add(store, doc(1, 10, "push notifications"))
    assert await store.delete(company_id=20, issue_id=1) is False
    assert await store.list_issue_ids() == [(10, 1)]
    assert await store.delete(company_id=10, issue_id=1) is True
    assert await store.list_issue_ids() == []


async def test_content_hash_is_scoped_to_the_company(store: VectorStore) -> None:
    await add(store, doc(1, 10, "push notifications"))
    assert await store.get_content_hash(company_id=10, issue_id=1) == "hash-1"
    assert await store.get_content_hash(company_id=20, issue_id=1) is None


async def test_upsert_without_a_vector_updates_text_and_keeps_the_vector(
    store: VectorStore,
) -> None:
    await add(store, doc(1, 10, "push notifications missing"))
    await store.upsert(doc(1, 10, "push notifications missing", resolution="Updated notes."), None)

    [hit] = await store.search(company_id=10, embedding=await vec("push notifications"), limit=1)
    assert hit.document.resolution == "Updated notes."
    assert hit.similarity > 0.5  # the vector is still there


async def test_list_issue_ids_can_filter_by_company(store: VectorStore) -> None:
    await add(store, doc(1, 10, "a"))
    await add(store, doc(2, 20, "b"))
    assert await store.list_issue_ids() == [(10, 1), (20, 2)]
    assert await store.list_issue_ids(company_id=20) == [(20, 2)]


@pytest.mark.parametrize("bad", [0, -5, True, "10", None])
async def test_every_scoped_operation_rejects_an_invalid_company_id(
    store: VectorStore, bad: object
) -> None:
    query = await vec("anything")
    with pytest.raises(ValueError, match="company_id"):
        await store.search(company_id=bad, embedding=query, limit=1)  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="company_id"):
        await store.delete(company_id=bad, issue_id=1)  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="company_id"):
        await store.get_content_hash(company_id=bad, issue_id=1)  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="company_id"):
        await store.upsert(doc(1, bad, "x"), query)  # type: ignore[arg-type]
