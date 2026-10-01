"""Resolved issues and their embeddings, for similarity search.

Revision ID: 0001
Revises:
Create Date: 2026-10-01
"""

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE ai.issue_documents (
            issue_id        BIGINT PRIMARY KEY,
            company_id      BIGINT NOT NULL,
            -- Engineers can only open issues on products they have access
            -- to, so searches can be narrowed to the viewer's products
            product_id      BIGINT NOT NULL,
            ticket_number   VARCHAR(16) NOT NULL,
            title           VARCHAR(200) NOT NULL,
            -- The client's description: what gets embedded, with the title
            problem         TEXT NOT NULL,
            -- Staff comments explaining the fix: stored for suggestions, not embedded
            resolution      TEXT NOT NULL,
            resolved_at     TIMESTAMPTZ,
            embedding       vector(384) NOT NULL,
            embedding_model VARCHAR(64) NOT NULL,
            content_hash    VARCHAR(64) NOT NULL,
            indexed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT issue_documents_company_positive CHECK (company_id > 0)
        )
        """
    )
    # Every search filters on company_id first
    op.execute(
        "CREATE INDEX idx_issue_documents_company ON ai.issue_documents (company_id, product_id)"
    )
    # Approximate nearest-neighbour index for when the corpus grows. At small
    # sizes the planner prefers the company index plus an exact sort, which is
    # both faster and exact; see docs/ai.md.
    op.execute(
        "CREATE INDEX idx_issue_documents_embedding ON ai.issue_documents "
        "USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE ai.issue_documents")
