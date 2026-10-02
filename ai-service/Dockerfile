# syntax=docker/dockerfile:1
#
# NewnopDesk AI service image.
#
#   docker build -t newnopdesk-ai-service ai-service
#   docker run --rm -p 127.0.0.1:8000:8000 --env-file ai-service/.env newnopdesk-ai-service
#
# Two stages: the builder installs exactly the locked dependencies and downloads
# the embedding model; the final image copies the result onto a clean Python
# base and runs as an unprivileged user.

ARG PYTHON_VERSION=3.12

# ─── Build ───────────────────────────────────────────────────────────────────
FROM python:${PYTHON_VERSION}-slim-bookworm AS build

# uv, pinned to the version that wrote uv.lock
COPY --from=ghcr.io/astral-sh/uv:0.12.21 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv

WORKDIR /app

# Dependencies first, in their own layer, so code changes don't reinstall them
COPY pyproject.toml uv.lock .python-version README.md ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-project

# Then the project itself. It stays an editable install in /app because
# `ai-db migrate` finds alembic.ini and migrations/ relative to the source.
COPY src ./src
COPY alembic.ini ./
COPY migrations ./migrations
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev

# Bake the embedding model into the image (~67 MB): no download at startup,
# no network needed for it at runtime, and every container uses the same model.
ARG EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
RUN /app/.venv/bin/python -c "from fastembed import TextEmbedding; TextEmbedding('${EMBEDDING_MODEL}', cache_dir='/app/models')"

# ─── Runtime ─────────────────────────────────────────────────────────────────
FROM python:${PYTHON_VERSION}-slim-bookworm

ARG EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
ENV PATH=/app/.venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    EMBEDDING_MODEL=${EMBEDDING_MODEL} \
    EMBEDDING_CACHE_DIR=/app/models \
    # The model is already in the image; never reach out to Hugging Face for it
    HF_HUB_OFFLINE=1

RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app

WORKDIR /app
COPY --from=build --chown=root:root /app /app

USER app
EXPOSE 8000

# No curl in the slim image; Python is enough for a liveness check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=4)"]

# Inside the container the service must listen on all interfaces so Docker can
# forward to it; the host only publishes it on 127.0.0.1 (see deploy/compose.prod.yml).
CMD ["ai-serve", "--host", "0.0.0.0", "--port", "8000"]
