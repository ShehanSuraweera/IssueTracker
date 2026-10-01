"""`ai-db` command.

uv run ai-db bootstrap --admin-url postgresql://admin:...@host/db
    One-time setup as a database administrator. The role name and password
    to create are read from AI_DATABASE_URL.

uv run ai-db migrate
    Apply schema migrations, connecting as the ai_service role.
"""

import argparse
import os
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config

from ai_service.config import get_settings
from ai_service.db.bootstrap import bootstrap, credentials_from_url

SERVICE_ROOT = Path(__file__).resolve().parents[3]


def alembic_config(database_url: str) -> Config:
    config = Config(str(SERVICE_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(SERVICE_ROOT / "migrations"))
    # Alembic uses SQLAlchemy; tell it to use the psycopg 3 driver.
    # % is escaped because Alembic's config treats it as interpolation.
    url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return config


def migrate(database_url: str) -> None:
    command.upgrade(alembic_config(database_url), "head")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ai-db", description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)
    boot = sub.add_parser("bootstrap", help="create the ai_service role and ai schema (admin)")
    boot.add_argument(
        "--admin-url",
        default=os.environ.get("AI_DB_ADMIN_URL"),
        help="administrator connection URL (or set AI_DB_ADMIN_URL)",
    )
    sub.add_parser("migrate", help="apply migrations as ai_service")
    args = parser.parse_args(argv)

    settings = get_settings()
    if settings.ai_database_url is None:
        print("AI_DATABASE_URL is not set", file=sys.stderr)
        return 2
    database_url = settings.ai_database_url.get_secret_value()

    if args.command == "bootstrap":
        if not args.admin_url:
            print("--admin-url or AI_DB_ADMIN_URL is required", file=sys.stderr)
            return 2
        role, password = credentials_from_url(database_url)
        for step in bootstrap(args.admin_url, role, password):
            print(f"  ok: {step}")
        return 0

    migrate(database_url)
    print("  ok: migrations applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
