"""Full stack: HTTP API -> retrieval service -> PostgreSQL + pgvector."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from ai_service.main import create_app
from tests.conftest import AUTH, PgUrls, clear_documents, make_settings
from tests.fakes import ScriptedProvider

pytestmark = pytest.mark.db


@pytest.fixture
def api(provider: ScriptedProvider, pg_urls: PgUrls) -> Iterator[TestClient]:
    # Exactly as in production: the app connects to the database at startup
    clear_documents(pg_urls)
    settings = make_settings(
        retrieval_min_similarity=0.3,
        ai_database_url=pg_urls.service,
        embedding_provider="fake",
    )
    with TestClient(create_app(settings, provider)) as client:
        assert client.get("/healthz").json()["retrieval"] == "enabled"
        client.headers.update(AUTH)
        yield client


def test_index_then_search_is_isolated_per_company(api: TestClient) -> None:
    text = "Rent reminders not arriving on iPhones"
    for issue_id, company_id, ticket in [(1, 10, "APT-0001"), (2, 20, "DVL-0002")]:
        response = api.put(
            f"/v1/documents/{issue_id}",
            json={
                "company_id": company_id,
                "product_id": company_id * 100 + 1,
                "ticket_number": ticket,
                "title": text,
                "problem": text,
            },
        )
        assert response.status_code == 200

    for company_id, expected in [(10, ["APT-0001"]), (20, ["DVL-0002"])]:
        results = api.post(
            "/v1/similar", json={"company_id": company_id, "title": text, "description": text}
        ).json()["results"]
        assert [r["ticket_number"] for r in results] == expected
        assert results[0]["similarity"] > 0.99
