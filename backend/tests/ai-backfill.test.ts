/**
 * The backfill queues AI work for data saved without it (seeded or restored),
 * matching what a live save would have queued.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_ENABLED = "true";
  process.env.AI_SERVICE_TOKEN = "stub-ai-service-token-0123456789abcdef";
});

import { prisma } from "../src/lib/prisma";
import { queueBackfill } from "../src/features/ai/ai.backfill";
import { freshWorld, type World } from "./helpers/fixtures";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-02T09:00:00Z");
let w: World;

beforeEach(async () => {
  w = await freshWorld();
});

const jobs = () =>
  prisma.aiJob.findMany({ orderBy: { nextAttemptAt: "asc" }, select: { kind: true, issueId: true, commentId: true, companyId: true, nextAttemptAt: true } });

describe("queueBackfill", () => {
  it("queues analysis for client issues and sentiment for client comments only", async () => {
    const clientComment = await prisma.issueComment.create({
      data: { issueId: w.issueA.id, userId: w.clientA.id, body: "Any update?" },
    });
    // Raised by staff: a live save wouldn't analyse it, so neither does the backfill
    await prisma.issue.create({
      data: {
        ticketNumber: "ACME-0002", productId: w.issueA.productId, title: "Staff-raised", description: "d",
        type: "bug", impact: "low", urgency: "low", priority: "low", createdBy: w.engineerA.id,
      },
    });

    const result = await queueBackfill({ intervalMs: 5000, now: NOW });

    expect(result).toMatchObject({ issues: 2, comments: 1 });
    const queued = await jobs();
    expect(queued.map((j) => [j.kind, j.issueId, j.commentId])).toEqual(
      expect.arrayContaining([
        ["analyze_issue", w.issueA.id, null],
        ["analyze_issue", w.issueB.id, null],
        ["sentiment_comment", w.issueA.id, clientComment.id],
      ])
    );
    expect(queued).toHaveLength(3);
    const commentJob = queued.find((j) => j.commentId === clientComment.id);
    expect(commentJob?.companyId).toBe(w.companyA.id);
  });

  it("spaces jobs out, oldest message first", async () => {
    await prisma.issue.update({ where: { id: w.issueB.id }, data: { createdAt: new Date(NOW.getTime() - 10 * DAY) } });
    await prisma.issue.update({ where: { id: w.issueA.id }, data: { createdAt: new Date(NOW.getTime() - 5 * DAY) } });
    const comment = await prisma.issueComment.create({
      data: { issueId: w.issueA.id, userId: w.clientA.id, body: "Any update?", createdAt: new Date(NOW.getTime() - 4 * DAY) },
    });

    const result = await queueBackfill({ intervalMs: 5000, now: NOW });

    const queued = await jobs();
    expect(queued.map((j) => j.commentId ?? j.issueId)).toEqual([w.issueB.id, w.issueA.id, comment.id]);
    expect(queued.map((j) => j.nextAttemptAt.getTime() - NOW.getTime())).toEqual([0, 5000, 10000]);
    expect(result.lastDueAt).toEqual(new Date(NOW.getTime() + 10000));
  });

  it("queues nothing new when run again, or for work that already has a job", async () => {
    await queueBackfill({ intervalMs: 0, now: NOW });
    const second = await queueBackfill({ intervalMs: 0, now: NOW });
    expect(second).toEqual({ issues: 0, comments: 0, lastDueAt: null });
    expect(await prisma.aiJob.count()).toBe(2);
  });

  it("only counts on a dry run", async () => {
    const result = await queueBackfill({ intervalMs: 5000, dryRun: true, now: NOW });
    expect(result).toMatchObject({ issues: 2, comments: 0 });
    expect(await prisma.aiJob.count()).toBe(0);
  });
});
