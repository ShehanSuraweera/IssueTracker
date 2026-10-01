/**
 * AI data for staff: triage suggestions, their review, and the sentiment timeline.
 *
 * Every function first loads the issue through buildTenantWhere(), the same
 * tenancy filter as every other issue endpoint, so a user only ever sees AI
 * data for issues they could already open. Routes allow engineers and admins
 * only; clients never receive AI data.
 */
import type { AiSentiment, AiSuggestion, Prisma } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/errorHandler";
import { buildTenantWhere, updateIssue, type AuthUser } from "../issues/issues.service";
import { enqueueIssueAnalysis } from "./ai.jobs";
import type { ReviewSuggestionInput } from "./ai.schemas";

function assertEnabled(): void {
  if (!env.AI_ENABLED) throw new AppError(404, "AI_DISABLED", "AI features are disabled");
}

async function findIssue(issueId: bigint, user: AuthUser, db: Prisma.TransactionClient = prisma) {
  const issue = await db.issue.findFirst({
    where: { id: issueId, ...buildTenantWhere(user) },
    select: {
      id: true,
      product: { select: { companyId: true } },
      creator: { select: { role: true } },
    },
  });
  if (!issue) throw new AppError(404, "ISSUE_NOT_FOUND", "Issue not found");
  return issue;
}

// ─── Suggestion ──────────────────────────────────────────────────────────────

export async function getSuggestion(issueId: bigint, user: AuthUser) {
  assertEnabled();
  await findIssue(issueId, user);

  const [job, suggestion] = await Promise.all([
    prisma.aiJob.findFirst({
      where: { issueId, kind: "analyze_issue" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.aiSuggestion.findFirst({
      where: { issueId, status: { not: "superseded" } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    analysis: job
      ? {
          status: job.status,
          attempts: job.attempts,
          // Only the error code: messages can be technical and aren't useful in the UI
          lastErrorCode: job.lastError?.split(":")[0] ?? null,
          updatedAt: job.updatedAt.toISOString(),
        }
      : { status: "none" as const, attempts: 0, lastErrorCode: null, updatedAt: null },
    suggestion: suggestion ? serializeSuggestion(suggestion) : null,
  };
}

export async function reviewSuggestion(
  issueId: bigint,
  suggestionId: bigint,
  input: ReviewSuggestionInput,
  user: AuthUser
) {
  assertEnabled();
  await findIssue(issueId, user);

  const suggestion = await prisma.aiSuggestion.findFirst({ where: { id: suggestionId, issueId } });
  if (!suggestion) throw new AppError(404, "SUGGESTION_NOT_FOUND", "Suggestion not found");
  if (suggestion.status !== "pending") throw alreadyReviewed();

  return prisma.$transaction(async (tx) => {
    const reviewed = { reviewedBy: user.id, reviewedAt: new Date() };

    if (input.action === "reject") {
      await markReviewed(tx, suggestion.id, { status: "rejected", ...reviewed });
      await logReview(tx, issueId, user, "rejected");
      return { suggestion: await reload(tx, suggestion.id), issue: null };
    }

    const applied = {
      impact: input.impact ?? suggestion.suggestedImpact,
      urgency: input.urgency ?? suggestion.suggestedUrgency,
      category: input.category ?? suggestion.suggestedCategory,
      team: input.team ?? suggestion.suggestedTeam,
    };
    // Decided from the data, not by the client, so acceptance-rate reports are trustworthy
    const edited =
      applied.impact !== suggestion.suggestedImpact ||
      applied.urgency !== suggestion.suggestedUrgency ||
      applied.category !== suggestion.suggestedCategory ||
      applied.team !== suggestion.suggestedTeam;
    const status = edited ? "edited" : "accepted";

    await markReviewed(tx, suggestion.id, {
      status,
      appliedImpact: applied.impact,
      appliedUrgency: applied.urgency,
      appliedCategory: applied.category,
      appliedTeam: applied.team,
      ...reviewed,
    });
    // Through the normal update path: tenancy, ITIL priority recomputation and
    // the activity log all apply, and the change is attributed to the reviewer
    const issue = await updateIssue(issueId, applied, user, { tx });
    await logReview(tx, issueId, user, status);
    return { suggestion: await reload(tx, suggestion.id), issue };
  });
}

/**
 * Updates the suggestion only if it's still pending. Two people reviewing at
 * the same moment can't both succeed: the second update matches no row.
 */
async function markReviewed(
  tx: Prisma.TransactionClient,
  suggestionId: bigint,
  data: Prisma.AiSuggestionUncheckedUpdateManyInput
): Promise<void> {
  const { count } = await tx.aiSuggestion.updateMany({
    where: { id: suggestionId, status: "pending" },
    data,
  });
  if (count === 0) throw alreadyReviewed();
}

async function logReview(
  tx: Prisma.TransactionClient,
  issueId: bigint,
  user: AuthUser,
  outcome: string
): Promise<void> {
  await tx.issueActivity.create({
    data: { issueId, userId: user.id, fieldName: "aiTriage", oldValue: null, newValue: outcome },
  });
}

async function reload(tx: Prisma.TransactionClient, suggestionId: bigint) {
  return serializeSuggestion(await tx.aiSuggestion.findUniqueOrThrow({ where: { id: suggestionId } }));
}

function alreadyReviewed(): AppError {
  return new AppError(409, "SUGGESTION_ALREADY_REVIEWED", "This suggestion has already been reviewed");
}

/** Queues a new analysis after a failed one. */
export async function retryAnalysis(issueId: bigint, user: AuthUser) {
  assertEnabled();
  const issue = await findIssue(issueId, user);
  if (issue.creator.role !== "client_user") {
    throw new AppError(422, "NOT_A_CLIENT_ISSUE", "AI analysis runs only on issues raised by clients");
  }

  return prisma.$transaction(async (tx) => {
    const latest = await tx.aiJob.findFirst({
      where: { issueId, kind: "analyze_issue" },
      orderBy: { createdAt: "desc" },
    });
    if (latest && (latest.status === "queued" || latest.status === "running")) {
      throw new AppError(409, "ANALYSIS_IN_PROGRESS", "An analysis is already queued or running");
    }
    await enqueueIssueAnalysis(tx, { issueId, companyId: issue.product.companyId });
    return { status: "queued" as const };
  });
}

// ─── Sentiment ───────────────────────────────────────────────────────────────

export async function getSentimentTimeline(issueId: bigint, user: AuthUser) {
  assertEnabled();
  await findIssue(issueId, user);

  const entries = await prisma.aiSentiment.findMany({
    where: { issueId },
    orderBy: { createdAt: "asc" },
  });
  const latest = entries.at(-1);

  return {
    entries: entries.map(serializeSentiment),
    latest: latest ? serializeSentiment(latest) : null,
    peakFrustration: entries.reduce((peak, e) => Math.max(peak, e.frustrationLevel), 0) || null,
  };
}

// ─── Serializers ─────────────────────────────────────────────────────────────

function serializeSuggestion(s: AiSuggestion) {
  return {
    id: s.id.toString(),
    issueId: s.issueId.toString(),
    status: s.status,
    suggested: {
      impact: { value: s.suggestedImpact, reason: s.impactReason },
      urgency: { value: s.suggestedUrgency, reason: s.urgencyReason },
      category: { value: s.suggestedCategory, reason: s.categoryReason },
      team: { value: s.suggestedTeam, reason: s.teamReason },
    },
    applied:
      s.appliedImpact && s.appliedUrgency && s.appliedCategory && s.appliedTeam
        ? {
            impact: s.appliedImpact,
            urgency: s.appliedUrgency,
            category: s.appliedCategory,
            team: s.appliedTeam,
          }
        : null,
    manipulationAttempt: s.manipulationAttempt,
    model: s.model,
    promptVersion: s.promptVersion,
    reviewedBy: s.reviewedBy?.toString() ?? null,
    reviewedAt: s.reviewedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
  };
}

function serializeSentiment(s: AiSentiment) {
  return {
    id: s.id.toString(),
    source: s.commentId ? ("comment" as const) : ("issue" as const),
    commentId: s.commentId?.toString() ?? null,
    sentiment: s.sentiment,
    frustrationLevel: s.frustrationLevel,
    escalationRisk: s.escalationRisk,
    evidenceQuote: s.evidenceQuote,
    reason: s.reason,
    manipulationAttempt: s.manipulationAttempt,
    model: s.model,
    promptVersion: s.promptVersion,
    createdAt: s.createdAt.toISOString(),
  };
}
