/**
 * Background worker that processes queued AI jobs.
 *
 * Jobs are claimed with SELECT ... FOR UPDATE SKIP LOCKED, so several workers
 * (or processes) can run at once without ever processing the same job twice.
 * A job whose worker died mid-run is reclaimed once its lock is older than
 * STALE_LOCK_MS. Failures are retried with exponential backoff while the
 * error is retryable and attempts remain; then the job is marked failed.
 *
 * The worker only writes AI tables. It never modifies an issue: suggestions
 * wait for a human to review them.
 */
import { hostname } from "os";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";
import { AiServiceError, type AiClient } from "./ai.client";
import type { CallMeta, ErrorMeta } from "./ai.schemas";

export const STALE_LOCK_MS = 5 * 60_000;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 15 * 60_000;
// Limits that keep requests within what the AI service accepts
const MAX_DESCRIPTION_CHARS = 20_000;
const MAX_PRODUCT_DESCRIPTION_CHARS = 2_000;

const log = logger.child({ component: "ai-worker" });

interface ClaimedJob {
  id: bigint;
  kind: "analyze_issue" | "sentiment_comment";
  issueId: bigint;
  commentId: bigint | null;
  companyId: bigint;
  attempts: number;
  maxAttempts: number;
}

export interface ProcessOptions {
  client: AiClient;
  limit?: number;
  workerId?: string;
  now?: () => Date;
}

/** Claims up to `limit` due jobs and processes them one by one. Returns how many it claimed. */
export async function processDueJobs(options: ProcessOptions): Promise<number> {
  const { client, limit = 5, workerId = defaultWorkerId(), now = () => new Date() } = options;
  // Don't claim jobs we already know will fail
  if (!client.isAvailable()) return 0;

  const jobs = await claimDueJobs(limit, workerId, now());
  for (const job of jobs) {
    await processJob(job, client, workerId, now);
  }
  return jobs.length;
}

async function claimDueJobs(limit: number, workerId: string, now: Date): Promise<ClaimedJob[]> {
  const staleBefore = new Date(now.getTime() - STALE_LOCK_MS);
  // One atomic statement: pick due jobs, skipping rows another worker has
  // locked, and mark them running. Times are passed in, not taken from the
  // database clock, so behaviour doesn't depend on the session time zone.
  return prisma.$queryRaw<ClaimedJob[]>`
    UPDATE ai_jobs
    SET status = 'running', locked_at = ${now}, locked_by = ${workerId},
        attempts = attempts + 1, updated_at = ${now}
    WHERE id IN (
      SELECT id FROM ai_jobs
      WHERE (status = 'queued' AND next_attempt_at <= ${now})
         OR (status = 'running' AND locked_at < ${staleBefore})
      ORDER BY next_attempt_at, id
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, kind::text AS kind, issue_id AS "issueId", comment_id AS "commentId",
              company_id AS "companyId", attempts, max_attempts AS "maxAttempts"
  `;
}

class LockLostError extends Error {}

async function processJob(
  job: ClaimedJob,
  client: AiClient,
  workerId: string,
  now: () => Date
): Promise<void> {
  const requestId = `ai-job-${job.id}-${job.attempts}`;
  try {
    if (job.kind === "analyze_issue") {
      await runIssueAnalysis(job, client, workerId, requestId);
    } else {
      await runCommentSentiment(job, client, workerId, requestId);
    }
  } catch (err) {
    if (err instanceof LockLostError) return; // another worker owns this job now
    const failure =
      err instanceof AiServiceError
        ? err
        : new AiServiceError("AI_INTERNAL_ERROR", "Unexpected error processing AI job", true);
    if (!(err instanceof AiServiceError)) {
      log.error({ err, jobId: job.id.toString() }, "unexpected error processing AI job");
    }
    await recordFailure(job, failure, workerId, requestId, now());
  }
}

async function runIssueAnalysis(
  job: ClaimedJob,
  client: AiClient,
  workerId: string,
  requestId: string
): Promise<void> {
  const issue = await prisma.issue.findUnique({
    where: { id: job.issueId },
    include: { product: { select: { name: true, description: true } } },
  });
  if (!issue) return completeWithoutResult(job, workerId);

  const response = await client.analyze(
    {
      issue_type: issue.type,
      title: issue.title,
      description: issue.description.slice(0, MAX_DESCRIPTION_CHARS),
      product: {
        name: issue.product.name,
        description: issue.product.description?.slice(0, MAX_PRODUCT_DESCRIPTION_CHARS) ?? null,
      },
    },
    { requestId }
  );
  const { triage, sentiment, manipulation_attempt: manipulationAttempt } = response.result;
  const source = sourceFields(response.meta);

  await prisma.$transaction(async (tx) => {
    await claimCompletion(tx, job, workerId);
    // A fresh analysis replaces any suggestion nobody has reviewed yet
    await tx.aiSuggestion.updateMany({
      where: { issueId: job.issueId, status: "pending" },
      data: { status: "superseded" },
    });
    await tx.aiSuggestion.create({
      data: {
        issueId: job.issueId,
        companyId: job.companyId,
        ...source,
        suggestedImpact: triage.impact,
        suggestedUrgency: triage.urgency,
        suggestedCategory: triage.category,
        suggestedTeam: triage.team,
        impactReason: triage.impact_reason,
        urgencyReason: triage.urgency_reason,
        categoryReason: triage.category_reason,
        teamReason: triage.team_reason,
        manipulationAttempt,
      },
    });
    await tx.aiSentiment.create({
      data: {
        issueId: job.issueId,
        commentId: null,
        companyId: job.companyId,
        ...sentimentFields(sentiment),
        manipulationAttempt,
        ...source,
      },
    });
    await tx.aiCallLog.create({ data: callLog(job, "analyze", "ok", requestId, response.meta) });
  });
}

async function runCommentSentiment(
  job: ClaimedJob,
  client: AiClient,
  workerId: string,
  requestId: string
): Promise<void> {
  const comment = job.commentId
    ? await prisma.issueComment.findUnique({
        where: { id: job.commentId },
        include: { issue: { select: { title: true } } },
      })
    : null;
  if (!comment) return completeWithoutResult(job, workerId);

  const response = await client.sentiment(
    { issue_title: comment.issue.title, comment: comment.body },
    { requestId }
  );
  const { sentiment, manipulation_attempt: manipulationAttempt } = response.result;

  await prisma.$transaction(async (tx) => {
    await claimCompletion(tx, job, workerId);
    await tx.aiSentiment.create({
      data: {
        issueId: job.issueId,
        commentId: comment.id,
        companyId: job.companyId,
        ...sentimentFields(sentiment),
        manipulationAttempt,
        ...sourceFields(response.meta),
      },
    });
    await tx.aiCallLog.create({
      data: callLog(job, "sentiment", "ok", requestId, response.meta),
    });
  });
}

/**
 * Marks the job done, but only if this worker still holds its lock. If the
 * lock went stale and another worker reclaimed the job, this throws and the
 * surrounding transaction rolls back, so results are never written twice.
 */
async function claimCompletion(
  tx: Prisma.TransactionClient,
  job: ClaimedJob,
  workerId: string
): Promise<void> {
  const { count } = await tx.aiJob.updateMany({
    where: { id: job.id, status: "running", lockedBy: workerId },
    data: { status: "done", lockedAt: null, lockedBy: null, lastError: null },
  });
  if (count === 0) throw new LockLostError();
}

async function completeWithoutResult(job: ClaimedJob, workerId: string): Promise<void> {
  // The issue or comment was deleted after the job was queued
  await prisma.aiJob.updateMany({
    where: { id: job.id, lockedBy: workerId },
    data: { status: "done", lockedAt: null, lockedBy: null },
  });
}

async function recordFailure(
  job: ClaimedJob,
  failure: AiServiceError,
  workerId: string,
  requestId: string,
  now: Date
): Promise<void> {
  const circuitOpen = failure.code === "AI_CIRCUIT_OPEN";
  const willRetry = failure.retryable && (circuitOpen || job.attempts < job.maxAttempts);
  const lastError = `${failure.code}: ${failure.message}`.slice(0, 500);

  await prisma.$transaction([
    // A paused circuit means no call was made, so there's nothing to log
    ...(circuitOpen
      ? []
      : [
          prisma.aiCallLog.create({
            data: callLog(
              job,
              job.kind === "analyze_issue" ? "analyze" : "sentiment",
              failure.code,
              requestId,
              failure.info.meta,
              failure.info.detail
            ),
          }),
        ]),
    prisma.aiJob.updateMany({
      where: { id: job.id, lockedBy: workerId },
      data: willRetry
        ? {
            status: "queued",
            nextAttemptAt: new Date(now.getTime() + backoffMs(job.attempts)),
            lockedAt: null,
            lockedBy: null,
            lastError,
            // A paused circuit didn't really use an attempt
            ...(circuitOpen && { attempts: job.attempts - 1 }),
          }
        : { status: "failed", lockedAt: null, lockedBy: null, lastError },
    }),
  ]);

  log.warn(
    { jobId: job.id.toString(), code: failure.code, attempt: job.attempts, willRetry },
    "AI job attempt failed"
  );
}

/** 30s, 60s, 120s, ... capped at 15 minutes, with ±20% jitter so retries spread out. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS);
  return Math.round(base * (0.8 + random() * 0.4));
}

function sourceFields(meta: CallMeta) {
  return { provider: meta.provider, model: meta.model, promptVersion: meta.prompt_version };
}

function sentimentFields(sentiment: {
  sentiment: "negative" | "neutral" | "positive";
  frustration_level: number;
  escalation_risk: "low" | "medium" | "high";
  evidence_quote: string;
  reason: string;
}) {
  return {
    sentiment: sentiment.sentiment,
    frustrationLevel: sentiment.frustration_level,
    escalationRisk: sentiment.escalation_risk,
    evidenceQuote: sentiment.evidence_quote,
    reason: sentiment.reason,
  };
}

function callLog(
  job: ClaimedJob,
  feature: "analyze" | "sentiment",
  status: string,
  requestId: string,
  meta?: CallMeta | ErrorMeta,
  detail?: string
) {
  return {
    feature,
    status,
    detail: detail ?? null,
    provider: meta?.provider ?? null,
    model: meta?.model ?? null,
    promptVersion: meta?.prompt_version ?? null,
    latencyMs: meta?.latency_ms ?? null,
    inputTokens: meta?.input_tokens ?? null,
    outputTokens: meta?.output_tokens ?? null,
    thinkingTokens: meta?.thinking_tokens ?? null,
    companyId: job.companyId,
    issueId: job.issueId,
    jobId: job.id,
    requestId,
  };
}

function defaultWorkerId(): string {
  return `${hostname()}-${process.pid}`.slice(0, 64);
}

// ─── Long-running loop ───────────────────────────────────────────────────────

export interface RunningWorker {
  stop(): Promise<void>;
}

/** Polls for due jobs until stopped. Works through a backlog without waiting between batches. */
export function startAiWorker(options: { client: AiClient; pollMs: number }): RunningWorker {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let current: Promise<void> = Promise.resolve();

  const tick = (): void => {
    if (stopped) return;
    current = processDueJobs({ client: options.client })
      .then((claimed) => claimed > 0)
      .catch((err: unknown) => {
        log.error({ err }, "AI worker poll failed");
        return false;
      })
      .then((busy) => {
        if (!stopped) timer = setTimeout(tick, busy ? 0 : options.pollMs);
      });
  };

  log.info({ pollMs: options.pollMs }, "AI worker started");
  tick();

  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await current; // let an in-flight job finish
      log.info("AI worker stopped");
    },
  };
}
