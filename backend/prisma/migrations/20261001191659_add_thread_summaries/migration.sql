-- CreateTable
CREATE TABLE "ai_thread_summaries" (
    "id" BIGSERIAL NOT NULL,
    "issue_id" BIGINT NOT NULL,
    "company_id" BIGINT NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "model" VARCHAR(64) NOT NULL,
    "prompt_version" VARCHAR(32) NOT NULL,
    "summary" VARCHAR(800) NOT NULL,
    "key_points" JSONB NOT NULL,
    "open_questions" TEXT[],
    "manipulation_attempt" BOOLEAN NOT NULL,
    "comment_count" INTEGER NOT NULL,
    "last_comment_id" BIGINT,
    "requested_by" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_thread_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_ai_summaries_issue" ON "ai_thread_summaries"("issue_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_thread_summaries" ADD CONSTRAINT "ai_thread_summaries_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
