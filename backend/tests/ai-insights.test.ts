/**
 * Thread summaries, the high-risk issue list and client health.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_ENABLED = "true";
  process.env.AI_SERVICE_TOKEN = "stub-ai-service-token-0123456789abcdef";
});

import request from "supertest";
import type { Issue, RiskLevel } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { setDefaultAiClient } from "../src/features/ai/ai.client";
import { bearer } from "./helpers/auth";
import { freshWorld, type World } from "./helpers/fixtures";
import { META, aiError, clientFor, startStubAiServer, type StubAiServer } from "./helpers/stub-ai-server";

const app = createApp();
const DAY = 24 * 60 * 60 * 1000;
let w: World;
let stub: StubAiServer;

beforeEach(async () => {
  w = await freshWorld();
  stub = await startStubAiServer();
  setDefaultAiClient(clientFor(stub.url));
});

afterEach(async () => {
  setDefaultAiClient(undefined);
  await stub.close();
});

// A reading of the issue description, or with `writtenAt`, of a client comment
// written at that time. `assessedAt` is when the AI produced it (default now).
async function sentiment(
  issue: Issue,
  companyId: bigint,
  { risk = "low", frustration = 2, writtenAt, assessedAt = new Date(), negative = false }: {
    risk?: RiskLevel;
    frustration?: number;
    writtenAt?: Date;
    assessedAt?: Date;
    negative?: boolean;
  } = {}
) {
  const comment = writtenAt
    ? await prisma.issueComment.create({
        data: { issueId: issue.id, userId: issue.createdBy, body: "client message", createdAt: writtenAt },
      })
    : null;
  return prisma.aiSentiment.create({
    data: {
      issueId: issue.id,
      commentId: comment?.id ?? null,
      companyId,
      sentiment: negative ? "negative" : "neutral",
      frustrationLevel: frustration,
      escalationRisk: risk,
      evidenceQuote: "quote",
      reason: "reason",
      manipulationAttempt: false,
      provider: "gemini",
      model: "m",
      promptVersion: "analyze-v1",
      createdAt: assessedAt,
    },
  });
}

// ─── Thread summary ──────────────────────────────────────────────────────────

describe("thread summary", () => {
  const path = () => `/api/issues/${w.issueA.id}/ai/summary`;

  async function addComments() {
    // The fixture already has two (one public, one internal); add a client one
    return prisma.issueComment.create({
      data: { issueId: w.issueA.id, userId: w.clientA.id, body: "Any update? Month-end is Friday." },
    });
  }

  function summaryResponse(keyPoints: { text: string; comment_ids: number[] }[]) {
    return {
      result: {
        summary: "Exports are blank; the renderer runs out of memory.",
        key_points: keyPoints,
        open_questions: ["Fixed before Friday?"],
        manipulation_attempt: false,
      },
      meta: { ...META, prompt_version: "summary-v1" },
      comments_included: 3,
      comments_omitted: 0,
    };
  }

  it("sends the whole thread with trusted roles, stores the summary and logs its cost", async () => {
    const clientComment = await addComments();
    stub.respond(200, summaryResponse([{ text: "Root cause found.", comment_ids: [Number(w.internalCommentA.id)] }]));

    const res = await request(app).post(path()).set(bearer(w.admin));
    expect(res.status).toBe(201);

    const sent = stub.requests[0].body;
    expect(stub.requests[0].path).toBe("/v1/summarize-thread");
    expect(sent.comments.map((c: { id: number }) => c.id)).toEqual(
      [w.publicCommentA.id, w.internalCommentA.id, clientComment.id].map(Number)
    );
    expect(sent.comments.map((c: { author_role: string; internal: boolean }) => [c.author_role, c.internal])).toEqual([
      ["staff", false],
      ["staff", true],
      ["client", false],
    ]);
    expect(res.body.data.summary).toMatchObject({
      keyPoints: [{ text: "Root cause found.", commentIds: [w.internalCommentA.id.toString()] }],
      openQuestions: ["Fixed before Friday?"],
      commentCount: 3,
      stale: false,
      promptVersion: "summary-v1",
    });
    expect(await prisma.aiCallLog.findFirstOrThrow()).toMatchObject({ feature: "summary", status: "ok", inputTokens: 1128 });
  });

  it("drops citations of comments that don't belong to this issue", async () => {
    await addComments();
    const foreign = await prisma.issueComment.create({
      data: { issueId: w.issueB.id, userId: w.clientB.id, body: "Globex comment" },
    });
    stub.respond(
      200,
      summaryResponse([
        { text: "Mixed citations.", comment_ids: [Number(w.publicCommentA.id), Number(foreign.id)] },
        { text: "Only foreign.", comment_ids: [Number(foreign.id)] },
      ])
    );
    const res = await request(app).post(path()).set(bearer(w.admin));
    expect(res.body.data.summary.keyPoints).toEqual([
      { text: "Mixed citations.", commentIds: [w.publicCommentA.id.toString()] },
    ]);
  });

  it("stores a citation of the issue description (id 0) as \"description\"", async () => {
    await addComments();
    stub.respond(200, summaryResponse([{ text: "From the description.", comment_ids: [0, Number(w.publicCommentA.id)] }]));
    const res = await request(app).post(path()).set(bearer(w.admin));
    expect(res.body.data.summary.keyPoints).toEqual([
      { text: "From the description.", commentIds: ["description", w.publicCommentA.id.toString()] },
    ]);
  });

  it("becomes stale when new comments are posted", async () => {
    await addComments();
    stub.respond(200, summaryResponse([{ text: "Point.", comment_ids: [Number(w.publicCommentA.id)] }]));
    await request(app).post(path()).set(bearer(w.admin));
    expect((await request(app).get(path()).set(bearer(w.admin))).body.data.summary.stale).toBe(false);

    await request(app).post(`/api/issues/${w.issueA.id}/comments`).set(bearer(w.engineerA)).send({ body: "Patched." });
    const after = await request(app).get(path()).set(bearer(w.admin));
    expect(after.body.data.summary.stale).toBe(true);
    expect(after.body.data.commentCount).toBe(4);
  });

  it("refuses threads that are too short, without calling the AI service", async () => {
    const res = await request(app).post(path()).set(bearer(w.admin));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("THREAD_TOO_SHORT");
    expect(stub.requests).toHaveLength(0);
  });

  it("is for admins only", async () => {
    await addComments();
    for (const user of [w.engineerA, w.clientA, w.clientB]) {
      expect((await request(app).post(path()).set(bearer(user))).status).toBe(403);
      expect((await request(app).get(path()).set(bearer(user))).status).toBe(403);
    }
    expect(stub.requests).toHaveLength(0);
  });

  it("reports the AI service failing as 503, and still logs the cost", async () => {
    await addComments();
    stub.respond(502, aiError("LLM_INVALID_OUTPUT", true));
    const res = await request(app).post(path()).set(bearer(w.admin));
    expect(res.status).toBe(503);
    expect(await prisma.aiCallLog.findFirstOrThrow()).toMatchObject({ feature: "summary", status: "LLM_INVALID_OUTPUT" });
    expect(await prisma.aiThreadSummary.count()).toBe(0);
  });
});

// ─── High escalation risk ────────────────────────────────────────────────────

describe("GET /api/ai/escalations", () => {
  const list = async (user = w.admin) => {
    const res = await request(app).get("/api/ai/escalations").set(bearer(user));
    expect(res.status).toBe(200);
    return res.body.data.issues as { issueId: string; priority: string; frustrationLevel: number }[];
  };

  it("lists open issues whose latest reading is high risk, with priority unchanged", async () => {
    await sentiment(w.issueA, w.companyA.id, { risk: "high", frustration: 5 });
    const issues = await list();
    expect(issues).toEqual([
      expect.objectContaining({ issueId: w.issueA.id.toString(), priority: "high", frustrationLevel: 5 }),
    ]);
    expect((await prisma.issue.findUniqueOrThrow({ where: { id: w.issueA.id } })).priority).toBe("high");
  });

  it("only the latest reading counts: a client who calmed down drops off", async () => {
    await sentiment(w.issueA, w.companyA.id, { risk: "high", assessedAt: new Date(Date.now() - 2 * DAY) });
    await sentiment(w.issueA, w.companyA.id, { risk: "low", assessedAt: new Date(Date.now() - DAY) });
    expect(await list()).toEqual([]);
  });

  it("ignores resolved and closed issues", async () => {
    await prisma.issue.update({ where: { id: w.issueA.id }, data: { status: "resolved" } });
    await sentiment(w.issueA, w.companyA.id, { risk: "high" });
    expect(await list()).toEqual([]);
  });

  it("follows the viewer's tenancy", async () => {
    await sentiment(w.issueA, w.companyA.id, { risk: "high" });
    await sentiment(w.issueB, w.companyB.id, { risk: "high" });
    expect((await list(w.engineerA)).map((i) => i.issueId)).toEqual([w.issueA.id.toString()]);
    expect((await list(w.engineerB)).map((i) => i.issueId)).toEqual([w.issueB.id.toString()]);
    expect(await list(w.admin)).toHaveLength(2);
    const asClient = await request(app).get("/api/ai/escalations").set(bearer(w.clientA));
    expect(asClient.status).toBe(403);
  });
});

// ─── Client health ───────────────────────────────────────────────────────────

describe("GET /api/ai/client-health", () => {
  const health = async (query = "") => {
    const res = await request(app).get(`/api/ai/client-health${query}`).set(bearer(w.admin));
    expect(res.status).toBe(200);
    return res.body.data;
  };

  it("buckets readings by week and compares the last 30 days with the 30 before", async () => {
    const recent = new Date(Date.now() - 3 * DAY);
    const older = new Date(Date.now() - 40 * DAY);
    await sentiment(w.issueA, w.companyA.id, { frustration: 4, writtenAt: recent, negative: true, risk: "high" });
    await sentiment(w.issueA, w.companyA.id, { frustration: 5, writtenAt: recent, negative: true });
    await sentiment(w.issueA, w.companyA.id, { frustration: 3, writtenAt: recent });
    await sentiment(w.issueA, w.companyA.id, { frustration: 1, writtenAt: older });
    await sentiment(w.issueA, w.companyA.id, { frustration: 2, writtenAt: older });

    const data = await health();
    const acme = data.companies.find((c: { name: string }) => c.name === "Acme");
    expect(acme.weeks).toEqual([
      { weekStart: expect.any(String), entries: 2, avgFrustration: 1.5, negativeShare: 0, highRisk: 0 },
      { weekStart: expect.any(String), entries: 3, avgFrustration: 4, negativeShare: 0.67, highRisk: 1 },
    ]);
    expect(acme).toMatchObject({ recentAvgFrustration: 4, previousAvgFrustration: 1.5, trend: "worsening" });
    // Weeks start on a Monday
    expect(new Date(`${acme.weeks[0].weekStart}T00:00:00Z`).getUTCDay()).toBe(1);
  });

  it("dates readings by when the client wrote, not when they were assessed", async () => {
    // Written 40 days ago, assessed just now (as after an outage or a backfill)
    await sentiment(w.issueA, w.companyA.id, { frustration: 5, writtenAt: new Date(Date.now() - 40 * DAY) });
    await prisma.issue.update({ where: { id: w.issueA.id }, data: { createdAt: new Date(Date.now() - 45 * DAY) } });
    await sentiment(w.issueA, w.companyA.id, { frustration: 3 }); // the description, dated by the issue

    const acme = (await health()).companies.find((c: { name: string }) => c.name === "Acme");
    expect(acme).toMatchObject({ recentAvgFrustration: null, previousAvgFrustration: 4 });
    expect(acme.weeks.map((wk: { entries: number }) => wk.entries).reduce((a: number, b: number) => a + b)).toBe(2);
  });

  it("includes companies without readings, and counts open high-risk issues", async () => {
    await sentiment(w.issueA, w.companyA.id, { risk: "high" });
    const data = await health();
    const globex = data.companies.find((c: { name: string }) => c.name === "Globex");
    expect(globex).toMatchObject({ weeks: [], trend: "insufficient_data", openHighRiskIssues: 0 });
    const acme = data.companies.find((c: { name: string }) => c.name === "Acme");
    expect(acme.openHighRiskIssues).toBe(1);
  });

  it("leaves out readings older than the requested window", async () => {
    await sentiment(w.issueA, w.companyA.id, { writtenAt: new Date(Date.now() - 100 * DAY) });
    const acme = (await health("?days=30")).companies.find((c: { name: string }) => c.name === "Acme");
    expect(acme.weeks).toEqual([]);
  });

  it("validates the window and is for admins only", async () => {
    for (const days of [7, 400]) {
      const res = await request(app).get(`/api/ai/client-health?days=${days}`).set(bearer(w.admin));
      expect(res.status).toBe(422);
    }
    for (const user of [w.engineerA, w.clientA]) {
      expect((await request(app).get("/api/ai/client-health").set(bearer(user))).status).toBe(403);
    }
  });
});
