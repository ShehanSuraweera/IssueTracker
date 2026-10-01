/**
 * Enqueueing AI work (the transactional outbox).
 *
 * These functions take the transaction that is saving the issue or comment,
 * so the job is committed atomically with it: if the save rolls back, so does
 * the job, and a job can never point at data that doesn't exist. Nothing here
 * calls the AI service; the worker does that later, so saving never waits for AI.
 */
import type { Prisma } from "@prisma/client";
import { env } from "../../config/env";

export async function enqueueIssueAnalysis(
  tx: Prisma.TransactionClient,
  job: { issueId: bigint; companyId: bigint }
): Promise<void> {
  if (!env.AI_ENABLED) return;
  await tx.aiJob.create({
    data: {
      kind: "analyze_issue",
      issueId: job.issueId,
      companyId: job.companyId,
      maxAttempts: env.AI_JOB_MAX_ATTEMPTS,
      nextAttemptAt: new Date(),
    },
  });
}

export async function enqueueCommentSentiment(
  tx: Prisma.TransactionClient,
  job: { issueId: bigint; commentId: bigint; companyId: bigint }
): Promise<void> {
  if (!env.AI_ENABLED) return;
  await tx.aiJob.create({
    data: {
      kind: "sentiment_comment",
      issueId: job.issueId,
      commentId: job.commentId,
      companyId: job.companyId,
      maxAttempts: env.AI_JOB_MAX_ATTEMPTS,
      nextAttemptAt: new Date(),
    },
  });
}
