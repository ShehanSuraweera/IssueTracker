/**
 * Queues AI analysis for issues and comments saved without it: data loaded by
 * the seed, restored from a backup, or written while AI was turned off.
 *
 * It queues exactly what a live save would have queued (analysis for issues
 * raised by clients, sentiment for client comments) and skips anything that
 * already has a job of that kind, so running it twice queues nothing new.
 * Jobs are spaced `intervalMs` apart, oldest message first, so the worker stays
 * under the LLM provider's rate limit.
 */
import { prisma } from "../../lib/prisma";
import { enqueueCommentSentiment, enqueueIssueAnalysis } from "./ai.jobs";

export interface BackfillOptions {
  intervalMs: number;
  dryRun?: boolean;
  now?: Date;
}

export interface BackfillResult {
  issues: number;
  comments: number;
  // When the last queued job becomes due
  lastDueAt: Date | null;
}

type Pending =
  | { kind: "issue"; issueId: bigint; companyId: bigint; writtenAt: Date }
  | { kind: "comment"; issueId: bigint; commentId: bigint; companyId: bigint; writtenAt: Date };

export async function findPending(): Promise<Pending[]> {
  const [issues, comments] = await Promise.all([
    prisma.issue.findMany({
      where: {
        creator: { role: "client_user" },
        aiJobs: { none: { kind: "analyze_issue" } },
      },
      select: { id: true, createdAt: true, product: { select: { companyId: true } } },
    }),
    prisma.issueComment.findMany({
      where: {
        user: { role: "client_user" },
        aiJobs: { none: { kind: "sentiment_comment" } },
      },
      select: { id: true, issueId: true, createdAt: true, issue: { select: { product: { select: { companyId: true } } } } },
    }),
  ]);

  const pending: Pending[] = [
    ...issues.map((i) => ({
      kind: "issue" as const,
      issueId: i.id,
      companyId: i.product.companyId,
      writtenAt: i.createdAt,
    })),
    ...comments.map((c) => ({
      kind: "comment" as const,
      issueId: c.issueId,
      commentId: c.id,
      companyId: c.issue.product.companyId,
      writtenAt: c.createdAt,
    })),
  ];
  // Oldest first, so each issue's description is assessed before its comments
  return pending.sort((a, b) => a.writtenAt.getTime() - b.writtenAt.getTime());
}

export async function queueBackfill({ intervalMs, dryRun = false, now = new Date() }: BackfillOptions): Promise<BackfillResult> {
  const pending = await findPending();
  const dueAt = (index: number) => new Date(now.getTime() + index * intervalMs);

  if (!dryRun) {
    await prisma.$transaction(async (tx) => {
      for (const [index, item] of pending.entries()) {
        const notBefore = dueAt(index);
        if (item.kind === "issue") {
          await enqueueIssueAnalysis(tx, { issueId: item.issueId, companyId: item.companyId, notBefore });
        } else {
          await enqueueCommentSentiment(tx, {
            issueId: item.issueId,
            commentId: item.commentId,
            companyId: item.companyId,
            notBefore,
          });
        }
      }
    });
  }

  return {
    issues: pending.filter((p) => p.kind === "issue").length,
    comments: pending.filter((p) => p.kind === "comment").length,
    lastDueAt: pending.length > 0 ? dueAt(pending.length - 1) : null,
  };
}
