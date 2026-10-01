"""Alembic environment. Migrations are plain SQL; no ORM models are involved."""

from alembic import context
from sqlalchemy import create_engine, pool

config = context.config


def run_migrations_online() -> None:
    url = config.get_main_option("sqlalchemy.url")
    if not url:
        raise RuntimeError("No database URL. Run migrations with `uv run ai-db migrate`.")
    engine = create_engine(url, poolclass=pool.NullPool, connect_args={"connect_timeout": 10})
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            # Keep Alembic's bookkeeping table inside the ai schema too
            version_table_schema="ai",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    raise RuntimeError("Offline (SQL script) mode is not supported")
run_migrations_online()
