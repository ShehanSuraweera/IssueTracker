/**
 * AI data for staff: triage suggestions, their review, and the sentiment timeline.
 *
 * Every function first loads the issue through buildTenantWhere(), the same
 * tenancy filter as every other issue endpoint, so a user only ever sees AI
 * data for issues they could already open. Routes allow engineers and admins
 * only; clients never receive AI data.
 */
import type { AiResolutionSuggestion, AiSentiment, AiSuggestion, Prisma } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/errorHandler";
import { buildTenantWhere, updateIssue, type AuthUser } from "../issues/issues.service";
import { logger } from "../../lib/logger";
import { AiServiceError, getDefaultAiClient, type RetrievalScope } from "./ai.client";
import { INDEXED_STATUSES, enqueueIssueAnalysis } from "./ai.jobs";
import type { CallMeta, ReviewSuggestionInput } from "./ai.schemas";

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

// ─── Similar issues and suggested resolutions ────────────────────────────────

function unavailable(err: unknown): AppError {
  logger.warn({ err }, "AI retrieval call failed");
  return new AppError(
    503,
    "AI_UNAVAILABLE",
    "AI suggestions are unavailable right now. Try again shortly."
  );
}

async function findIssueForRetrieval(issueId: bigint, user: AuthUser) {
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, ...buildTenantWhere(user) },
    select: {
      id: true,
      type: true,
      title: true,
      description: true,
      product: { select: { companyId: true } },
    },
  });
  if (!issue) throw new AppError(404, "ISSUE_NOT_FOUND", "Issue not found");
  return issue;
}

/**
 * What retrieval may draw on for this viewer: the issue's company, narrowed to
 * the products the viewer can open. Admins see every product; engineers only
 * those they have been granted. AI never shows an issue the viewer couldn't open.
 */
async function retrievalScope(companyId: bigint, user: AuthUser): Promise<RetrievalScope> {
  if (user.role === "admin") return { company_id: Number(companyId) };
  const access = await prisma.userProductAccess.findMany({
    where: { userId: user.id, product: { companyId } },
    select: { productId: true },
  });
  return { company_id: Number(companyId), product_ids: access.map((a) => Number(a.productId)) };
}

interface VisibleIssue {
  id: bigint;
  ticketNumber: string;
  title: string;
  status: string;
  resolvedAt: Date | null;
  closedAt: Date | null;
  product: { name: string };
}

/**
 * Second, independent check on results from the AI service: keep only issues
 * that exist, are still resolved, belong to the company, and that this viewer
 * may open. Catches anything the index hasn't caught up with yet (reopened or
 * deleted issues) and would also stop a cross-tenant result if one came back.
 */
async function visibleResolvedIssues(
  ids: number[],
  companyId: bigint,
  user: AuthUser
): Promise<Map<number, VisibleIssue>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.issue.findMany({
    where: {
      // AND, not object spread: buildTenantWhere may also filter on `product`
      AND: [
        { id: { in: ids.map((id) => BigInt(id)) } },
        { status: { in: [...INDEXED_STATUSES] } },
        { product: { companyId } },
        buildTenantWhere(user),
      ],
    },
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      status: true,
      resolvedAt: true,
      closedAt: true,
      product: { select: { name: true } },
    },
  });
  return new Map(rows.map((row) => [Number(row.id), row]));
}

function serializeSource(source: { issue_id: number; similarity: number }, issue: VisibleIssue) {
  return {
    issueId: String(source.issue_id),
    ticketNumber: issue.ticketNumber,
    title: issue.title,
    status: issue.status,
    productName: issue.product.name,
    resolvedAt: (issue.resolvedAt ?? issue.closedAt)?.toISOString() ?? null,
    similarity: source.similarity,
  };
}

export async function getSimilarIssues(issueId: bigint, user: AuthUser, requestId: string) {
  assertEnabled();
  const issue = await findIssueForRetrieval(issueId, user);
  const scope = await retrievalScope(issue.product.companyId, user);

  let response;
  try {
    response = await getDefaultAiClient().similar(
      {
        ...scope,
        title: issue.title,
        description: issue.description.slice(0, 20_000),
        exclude_issue_id: Number(issue.id),
        limit: 5,
      },
      { requestId }
    );
  } catch (err) {
    throw unavailable(err);
  }

  const visible = await visibleResolvedIssues(
    response.results.map((r) => r.issue_id),
    issue.product.companyId,
    user
  );
  return {
    results: response.results.flatMap((r) => {
      const shown = visible.get(r.issue_id);
      return shown ? [serializeSource(r, shown)] : [];
    }),
    minSimilarity: response.min_similarity,
  };
}

export async function requestResolution(issueId: bigint, user: AuthUser, requestId: string) {
  assertEnabled();
  const issue = await findIssueForRetrieval(issueId, user);
  const companyId = issue.product.companyId;
  const scope = await retrievalScope(companyId, user);

  let response;
  try {
    response = await getDefaultAiClient().suggestResolution(
      {
        ...scope,
        issue_type: issue.type,
        title: issue.title,
        description: issue.description.slice(0, 20_000),
        exclude_issue_id: Number(issue.id),
      },
      { requestId }
    );
  } catch (err) {
    // A failed LLM call can still have cost tokens, so record it
    if (err instanceof AiServiceError && err.info.meta?.latency_ms != null) {
      await prisma.aiCallLog.create({
        data: resolutionCallLog(err.code, err.info.meta, companyId, issueId, requestId, err.info.detail),
      });
    }
    throw unavailable(err);
  }

  const { result, sources, meta } = response;
  const visible = await visibleResolvedIssues(
    sources.map((s) => s.issue_id),
    companyId,
    user
  );
  const shownSources = sources.flatMap((s) => {
    const shown = visible.get(s.issue_id);
    return shown ? [serializeSource(s, shown)] : [];
  });
  const shownTickets = new Set(shownSources.map((s) => s.ticketNumber));
  const citedTickets = result.cited_tickets.filter((t) => shownTickets.has(t));

  if (!meta) {
    // No similar history, so no LLM call was made and there is nothing to store
    return {
      suggestion: {
        id: null,
        hasRelevantHistory: false,
        summary: result.summary,
        steps: [],
        citedTickets: [],
        sources: [],
        confidence: result.confidence,
        manipulationAttempt: false,
        model: null,
        promptVersion: null,
        feedback: null,
        createdAt: new Date().toISOString(),
      },
    };
  }

  const [stored] = await prisma.$transaction([
    prisma.aiResolutionSuggestion.create({
      data: {
        issueId,
        companyId,
        provider: meta.provider,
        model: meta.model,
        promptVersion: meta.prompt_version,
        hasRelevantHistory: result.has_relevant_history,
        summary: result.summary,
        steps: result.steps,
        citedTickets,
        sources: shownSources,
        confidence: result.confidence,
        manipulationAttempt: result.manipulation_attempt,
        requestedBy: user.id,
      },
    }),
    prisma.aiCallLog.create({
      data: resolutionCallLog("ok", meta, companyId, issueId, requestId),
    }),
  ]);
  return { suggestion: serializeResolution(stored) };
}

export async function getLatestResolution(issueId: bigint, user: AuthUser) {
  assertEnabled();
  await findIssue(issueId, user);
  const latest = await prisma.aiResolutionSuggestion.findFirst({
    where: { issueId },
    orderBy: { createdAt: "desc" },
  });
  return { suggestion: latest ? serializeResolution(latest) : null };
}

export async function giveResolutionFeedback(
  issueId: bigint,
  resolutionId: bigint,
  feedback: "helpful" | "not_helpful",
  user: AuthUser
) {
  assertEnabled();
  await findIssue(issueId, user);
  const existing = await prisma.aiResolutionSuggestion.findFirst({
    where: { id: resolutionId, issueId },
  });
  if (!existing) {
    throw new AppError(404, "RESOLUTION_NOT_FOUND", "Suggested resolution not found");
  }

  // Only the first feedback counts, so repeat clicks can't skew the helpfulness rate
  const { count } = await prisma.aiResolutionSuggestion.updateMany({
    where: { id: resolutionId, feedback: null },
    data: { feedback, feedbackBy: user.id, feedbackAt: new Date() },
  });
  if (count === 0) {
    throw new AppError(409, "FEEDBACK_ALREADY_GIVEN", "Feedback has already been recorded");
  }
  const updated = await prisma.aiResolutionSuggestion.findUniqueOrThrow({
    where: { id: resolutionId },
  });
  return { suggestion: serializeResolution(updated) };
}

type MetaLike = Partial<Record<keyof CallMeta, string | number | null>>;

function resolutionCallLog(
  status: string,
  meta: MetaLike,
  companyId: bigint,
  issueId: bigint,
  requestId: string,
  detail?: string
) {
  const text = (v: string | number | null | undefined) => (typeof v === "string" ? v : null);
  const num = (v: string | number | null | undefined) => (typeof v === "number" ? v : null);
  return {
    feature: "resolution",
    status,
    detail: detail ?? null,
    provider: text(meta.provider),
    model: text(meta.model),
    promptVersion: text(meta.prompt_version),
    latencyMs: num(meta.latency_ms),
    inputTokens: num(meta.input_tokens),
    outputTokens: num(meta.output_tokens),
    thinkingTokens: num(meta.thinking_tokens),
    companyId,
    issueId,
    jobId: null,
    requestId: requestId.slice(0, 64),
  };
}

function serializeResolution(r: AiResolutionSuggestion) {
  return {
    id: r.id.toString(),
    hasRelevantHistory: r.hasRelevantHistory,
    summary: r.summary,
    steps: r.steps,
    citedTickets: r.citedTickets,
    sources: r.sources,
    confidence: r.confidence,
    manipulationAttempt: r.manipulationAttempt,
    model: r.model,
    promptVersion: r.promptVersion,
    feedback: r.feedback,
    createdAt: r.createdAt.toISOString(),
  };
}
