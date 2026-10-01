"""The ai_service database role can use its own schema and nothing else.

These run against a real PostgreSQL, set up by the same bootstrap and
migrations as production. They prove the isolation is enforced by the
database itself, not just by the service's code.
"""

from collections.abc import Iterator

import psycopg
import pytest
from psycopg import errors

from ai_service.db.bootstrap import bootstrap
from tests.conftest import SERVICE_PASSWORD, SERVICE_ROLE, PgUrls

pytestmark = pytest.mark.db


@pytest.fixture(scope="module")
def app_table(pg_urls: PgUrls) -> Iterator[None]:
    """A stand-in for the application's tables, owned by the admin in public.

    Bootstrap runs again afterwards, because that's the production order: the
    application's tables already exist when the AI role is set up. A grant
    like "GRANT SELECT ON ALL TABLES" only reaches tables that exist at the
    time, so testing in the other order would miss it.
    """
    with psycopg.connect(pg_urls.admin, autocommit=True) as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS public.users (id int, email text)")
        conn.execute("INSERT INTO public.users VALUES (1, 'client@example.com')")
    bootstrap(pg_urls.admin, SERVICE_ROLE, SERVICE_PASSWORD)
    yield
    with psycopg.connect(pg_urls.admin, autocommit=True) as conn:
        conn.execute("DROP TABLE public.users")


def test_service_role_cannot_read_application_tables(pg_urls: PgUrls, app_table: None) -> None:
    with (
        psycopg.connect(pg_urls.service) as conn,
        pytest.raises(errors.InsufficientPrivilege, match="permission denied for table users"),
    ):
        conn.execute("SELECT email FROM public.users")


def test_service_role_cannot_write_application_tables(pg_urls: PgUrls, app_table: None) -> None:
    with psycopg.connect(pg_urls.service) as conn, pytest.raises(errors.InsufficientPrivilege):
        conn.execute("UPDATE public.users SET email = 'attacker@example.com'")


def test_service_role_cannot_create_tables_in_public(pg_urls: PgUrls) -> None:
    with psycopg.connect(pg_urls.service) as conn, pytest.raises(errors.InsufficientPrivilege):
        conn.execute("CREATE TABLE public.sneaky (id int)")


def test_service_role_works_in_its_own_schema(pg_urls: PgUrls) -> None:
    with psycopg.connect(pg_urls.service) as conn:
        path = conn.execute("SHOW search_path").fetchone()
        count = conn.execute("SELECT count(*) FROM issue_documents").fetchone()
    assert path == ("ai",)
    assert count is not None


def test_vector_extension_lives_in_the_ai_schema(pg_urls: PgUrls) -> None:
    with psycopg.connect(pg_urls.admin) as conn:
        row = conn.execute(
            "SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace "
            "WHERE e.extname = 'vector'"
        ).fetchone()
    assert row == ("ai",)


def test_company_id_must_be_positive_even_for_direct_inserts(pg_urls: PgUrls) -> None:
    zero = "[" + ",".join(["0.1"] * 384) + "]"
    with psycopg.connect(pg_urls.service) as conn, pytest.raises(errors.CheckViolation):
        conn.execute(
            "INSERT INTO issue_documents (issue_id, company_id, product_id, ticket_number, "
            "title, problem, resolution, embedding, embedding_model, content_hash) "
            "VALUES (1, 0, 1, 'X-0001', 't', 'p', '', %s, 'm', repeat('a', 64))",
            (zero,),
        )


def test_bootstrap_is_idempotent(pg_urls: PgUrls) -> None:
    steps = bootstrap(pg_urls.admin, SERVICE_ROLE, SERVICE_PASSWORD)
    assert any("updated role" in step for step in steps)
    with psycopg.connect(pg_urls.service) as conn:
        assert conn.execute("SELECT 1").fetchone() == (1,)
