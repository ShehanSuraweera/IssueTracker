-- CreateEnum
CREATE TYPE "IssueCategory" AS ENUM ('authentication_access', 'notifications', 'data_integrity', 'performance', 'ui_display', 'crash_error', 'file_handling', 'integrations', 'reporting_analytics', 'other');

-- CreateEnum
CREATE TYPE "EngineeringTeam" AS ENUM ('mobile', 'web_frontend', 'backend', 'data_platform', 'infrastructure', 'support');

-- CreateEnum
CREATE TYPE "AiJobKind" AS ENUM ('analyze_issue', 'sentiment_comment');

-- CreateEnum
CREATE TYPE "AiJobStatus" AS ENUM ('queued', 'running', 'done', 'failed');

-- CreateEnum
CREATE TYPE "AiSuggestionStatus" AS ENUM ('pending', 'accepted', 'edited', 'rejected', 'superseded');

-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('negative', 'neutral', 'positive');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('low', 'medium', 'high');

-- AlterTable
ALTER TABLE "issues" ADD COLUMN     "category" "IssueCategory",
ADD COLUMN     "team" "EngineeringTeam";

-- CreateTable
CREATE TABLE "ai_jobs" (
    "id" BIGSERIAL NOT NULL,
    "kind" "AiJobKind" NOT NULL,
    "status" "AiJobStatus" NOT NULL DEFAULT 'queued',
    "issue_id" BIGINT NOT NULL,
    "comment_id" BIGINT,
    "company_id" BIGINT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "locked_by" VARCHAR(64),
    "last_error" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_suggestions" (
    "id" BIGSERIAL NOT NULL,
    "issue_id" BIGINT NOT NULL,
    "company_id" BIGINT NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "model" VARCHAR(64) NOT NULL,
    "prompt_version" VARCHAR(32) NOT NULL,
    "suggested_impact" "ImpactLevel" NOT NULL,
    "suggested_urgency" "UrgencyLevel" NOT NULL,
    "suggested_category" "IssueCategory" NOT NULL,
    "suggested_team" "EngineeringTeam" NOT NULL,
    "impact_reason" VARCHAR(300) NOT NULL,
    "urgency_reason" VARCHAR(300) NOT NULL,
    "category_reason" VARCHAR(300) NOT NULL,
    "team_reason" VARCHAR(300) NOT NULL,
    "manipulation_attempt" BOOLEAN NOT NULL,
    "status" "AiSuggestionStatus" NOT NULL DEFAULT 'pending',
    "applied_impact" "ImpactLevel",
    "applied_urgency" "UrgencyLevel",
    "applied_category" "IssueCategory",
    "applied_team" "EngineeringTeam",
    "reviewed_by" BIGINT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_sentiments" (
    "id" BIGSERIAL NOT NULL,
    "issue_id" BIGINT NOT NULL,
    "comment_id" BIGINT,
    "company_id" BIGINT NOT NULL,
    "sentiment" "Sentiment" NOT NULL,
    "frustration_level" SMALLINT NOT NULL,
    "escalation_risk" "RiskLevel" NOT NULL,
    "evidence_quote" VARCHAR(300) NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "manipulation_attempt" BOOLEAN NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "model" VARCHAR(64) NOT NULL,
    "prompt_version" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_sentiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_call_logs" (
    "id" BIGSERIAL NOT NULL,
    "feature" VARCHAR(32) NOT NULL,
    "status" VARCHAR(40) NOT NULL,
    "detail" VARCHAR(64),
    "provider" VARCHAR(32),
    "model" VARCHAR(64),
    "prompt_version" VARCHAR(32),
    "latency_ms" INTEGER,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "thinking_tokens" INTEGER,
    "company_id" BIGINT,
    "issue_id" BIGINT,
    "job_id" BIGINT,
    "request_id" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_ai_jobs_due" ON "ai_jobs"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "idx_ai_jobs_issue" ON "ai_jobs"("issue_id");

-- CreateIndex
CREATE INDEX "idx_ai_suggestions_issue" ON "ai_suggestions"("issue_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_ai_suggestions_company_status" ON "ai_suggestions"("company_id", "status");

-- CreateIndex
CREATE INDEX "idx_ai_sentiments_issue" ON "ai_sentiments"("issue_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_ai_sentiments_company" ON "ai_sentiments"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_ai_call_logs_created" ON "ai_call_logs"("created_at");

-- CreateIndex
CREATE INDEX "idx_ai_call_logs_feature_status" ON "ai_call_logs"("feature", "status");

-- AddForeignKey
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "issue_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_sentiments" ADD CONSTRAINT "ai_sentiments_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_sentiments" ADD CONSTRAINT "ai_sentiments_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "issue_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integrity rules Prisma's schema language can't express. They apply even to
-- writes that bypass the application.
ALTER TABLE "ai_sentiments" ADD CONSTRAINT "ai_sentiments_frustration_level_check"
    CHECK ("frustration_level" BETWEEN 1 AND 5);

-- A comment-sentiment job must point at a comment; an issue-analysis job must not
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_comment_matches_kind_check"
    CHECK (("kind" = 'sentiment_comment') = ("comment_id" IS NOT NULL));
