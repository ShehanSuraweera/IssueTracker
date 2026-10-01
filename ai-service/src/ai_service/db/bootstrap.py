"""One-time database setup, run with administrator credentials.

Creates a dedicated login role for the AI service and a schema it owns:

    ai schema         owned by ai_service: its tables and the pgvector extension
    public schema     the application's tables: ai_service gets no privileges

The AI service then connects as ai_service. PostgreSQL itself refuses any
attempt to read the application's tables (users, issues, refresh tokens...),
so the AI service can only ever see the issue text the backend sends it.

Idempotent: safe to run again, e.g. to rotate the password.
"""

from urllib.parse import unquote, urlsplit

import psycopg
from psycopg import sql

SCHEMA = "ai"


def credentials_from_url(url: str) -> tuple[str, str]:
    """The role name and password the AI service will log in with."""
    parts = urlsplit(url)
    if not parts.username or not parts.password:
        raise ValueError("AI_DATABASE_URL must include a username and password")
    return unquote(parts.username), unquote(parts.password)


def bootstrap(admin_url: str, role: str, password: str) -> list[str]:
    """Create or update the role, schema and extension. Returns what was done."""
    steps: list[str] = []
    with psycopg.connect(admin_url, autocommit=True, connect_timeout=10) as conn:
        exists = conn.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (role,)).fetchone()
        verb = "ALTER" if exists else "CREATE"
        conn.execute(
            sql.SQL("{} ROLE {} LOGIN PASSWORD {}").format(
                sql.SQL(verb), sql.Identifier(role), sql.Literal(password)
            )
        )
        steps.append(f"{'created' if verb == 'CREATE' else 'updated'} role {role}")

        database = conn.execute("SELECT current_database()").fetchone()
        conn.execute(
            sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(
                sql.Identifier(str(database[0]) if database else ""), sql.Identifier(role)
            )
        )

        conn.execute(
            sql.SQL("CREATE SCHEMA IF NOT EXISTS {} AUTHORIZATION {}").format(
                sql.Identifier(SCHEMA), sql.Identifier(role)
            )
        )
        conn.execute(
            sql.SQL("ALTER SCHEMA {} OWNER TO {}").format(
                sql.Identifier(SCHEMA), sql.Identifier(role)
            )
        )
        steps.append(f"schema {SCHEMA} owned by {role}")

        # The extension lives in the ai schema too, keeping the application's
        # public schema exactly as Prisma manages it
        current = conn.execute(
            "SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace "
            "WHERE e.extname = 'vector'"
        ).fetchone()
        if current is None:
            conn.execute(
                sql.SQL("CREATE EXTENSION vector SCHEMA {}").format(sql.Identifier(SCHEMA))
            )
            steps.append(f"created extension vector in {SCHEMA}")
        elif current[0] != SCHEMA:
            conn.execute(
                sql.SQL("ALTER EXTENSION vector SET SCHEMA {}").format(sql.Identifier(SCHEMA))
            )
            steps.append(f"moved extension vector from {current[0]} to {SCHEMA}")

        conn.execute(
            sql.SQL("ALTER ROLE {} SET search_path = {}").format(
                sql.Identifier(role), sql.Identifier(SCHEMA)
            )
        )
        # Belt and braces: in case anything was ever granted on public
        conn.execute(
            sql.SQL("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {}").format(
                sql.Identifier(role)
            )
        )
        conn.execute(sql.SQL("REVOKE CREATE ON SCHEMA public FROM {}").format(sql.Identifier(role)))
        steps.append(f"search_path={SCHEMA}; no privileges on public tables")
    return steps
