-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "ResolutionFeedback" AS ENUM ('helpful', 'not_helpful');

-- AlterEnum
ALTER TYPE "AiJobKind" ADD VALUE 'index_issue';

-- CreateTable
CREATE TABLE "ai_resolution_suggestions" (
    "id" BIGSERIAL NOT NULL,
    "issue_id" BIGINT NOT NULL,
    "company_id" BIGINT NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "model" VARCHAR(64) NOT NULL,
    "prompt_version" VARCHAR(32) NOT NULL,
    "has_relevant_history" BOOLEAN NOT NULL,
    "summary" VARCHAR(500) NOT NULL,
    "steps" TEXT[],
    "cited_tickets" TEXT[],
    "sources" JSONB NOT NULL,
    "confidence" "ConfidenceLevel" NOT NULL,
    "manipulation_attempt" BOOLEAN NOT NULL,
    "requested_by" BIGINT NOT NULL,
    "feedback" "ResolutionFeedback",
    "feedback_by" BIGINT,
    "feedback_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_resolution_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_ai_resolutions_issue" ON "ai_resolution_suggestions"("issue_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_ai_resolutions_company_feedback" ON "ai_resolution_suggestions"("company_id", "feedback");

-- AddForeignKey
ALTER TABLE "ai_resolution_suggestions" ADD CONSTRAINT "ai_resolution_suggestions_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
