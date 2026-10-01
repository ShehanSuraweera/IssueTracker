/**
 * Staff-facing AI endpoints: tenancy, reviewing suggestions, and keeping AI
 * data away from clients.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_ENABLED = "true";
  process.env.AI_SERVICE_TOKEN = "stub-ai-service-token-0123456789abcdef";
});

import request from "supertest";
import type { Test } from "supertest";
import type { User } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { bearer } from "./helpers/auth";
import { freshWorld, type World } from "./helpers/fixtures";

const app = createApp();
// Real evidence quotes are copied from the client's own text, so a client
// seeing those words proves nothing. These markers exist only in AI data.
const EVIDENCE = "AI-ONLY-EVIDENCE-MARKER";
const SENTIMENT_REASON = "AI-ONLY-SENTIMENT-REASON";

let w: World;

beforeEach(async () => {
  w = await freshWorld();
});

function seedSuggestion(issueId = w.issueA.id, companyId = w.companyA.id) {
  // Issue A is impact=high, urgency=medium; the suggestion raises urgency
  return prisma.aiSuggestion.create({
    data: {
      issueId,
      companyId,
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
      promptVersion: "analyze-v1",
      suggestedImpact: "high",
      suggestedUrgency: "high",
      suggestedCategory: "file_handling",
      suggestedTeam: "backend",
      impactReason: "All exports fail.",
      urgencyReason: "Month-end is blocked.",
      categoryReason: "PDF export.",
      teamReason: "Server-side rendering.",
      manipulationAttempt: false,
    },
  });
}

function seedSentiment() {
  return prisma.aiSentiment.create({
    data: {
      issueId: w.issueA.id,
      companyId: w.companyA.id,
      sentiment: "negative",
      frustrationLevel: 4,
      escalationRisk: "medium",
      evidenceQuote: EVIDENCE,
      reason: SENTIMENT_REASON,
      manipulationAttempt: false,
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
      promptVersion: "analyze-v1",
    },
  });
}

// ─── Tenancy ─────────────────────────────────────────────────────────────────

describe("AI endpoint access", () => {
  type Probe = { name: string; send: (w: World, suggestionId: bigint) => Test };
  const probes: Probe[] = [
    { name: "GET  suggestion", send: (w) => request(app).get(`/api/issues/${w.issueA.id}/ai/suggestion`) },
    { name: "GET  sentiment", send: (w) => request(app).get(`/api/issues/${w.issueA.id}/ai/sentiment`) },
    {
      name: "POST review",
      send: (w, id) =>
        request(app).post(`/api/issues/${w.issueA.id}/ai/suggestion/${id}/review`).send({ action: "apply" }),
    },
    { name: "POST analyze", send: (w) => request(app).post(`/api/issues/${w.issueA.id}/ai/analyze`) },
  ];
  const clients: [string, (w: World) => User][] = [
    ["client of the same company", (w) => w.clientA],
    ["client of another company", (w) => w.clientB],
  ];

  describe.each(clients)("%s", (_label, pick) => {
    it.each(probes)("$name → 403", async ({ send }) => {
      const suggestion = await seedSuggestion();
      const res = await send(w, suggestion.id).set(bearer(pick(w)));
      expect(res.status).toBe(403);
    });
  });

  it.each(probes)("engineer without product access: $name → 404 and nothing changes", async ({ send }) => {
    const suggestion = await seedSuggestion();
    const res = await send(w, suggestion.id).set(bearer(w.engineerB));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ISSUE_NOT_FOUND");
    expect((await prisma.aiSuggestion.findUniqueOrThrow({ where: { id: suggestion.id } })).status).toBe("pending");
    expect(await prisma.aiJob.count()).toBe(0);
    expect(await prisma.issueActivity.count()).toBe(0);
  });

  it("engineers with access and admins can read suggestions and sentiment", async () => {
    await seedSuggestion();
    await seedSentiment();
    for (const staff of [w.engineerA, w.admin]) {
      const suggestion = await request(app).get(`/api/issues/${w.issueA.id}/ai/suggestion`).set(bearer(staff));
      expect(suggestion.status).toBe(200);
      expect(suggestion.body.data.suggestion.suggested.urgency).toEqual({
        value: "high",
        reason: "Month-end is blocked.",
      });
      const sentiment = await request(app).get(`/api/issues/${w.issueA.id}/ai/sentiment`).set(bearer(staff));
      expect(sentiment.status).toBe(200);
      expect(sentiment.body.data.latest.evidenceQuote).toBe(EVIDENCE);
    }
  });

  it("a suggestion can't be reviewed through another issue's URL", async () => {
    const otherIssuesSuggestion = await seedSuggestion(w.issueB.id, w.companyB.id);
    const res = await request(app)
      .post(`/api/issues/${w.issueA.id}/ai/suggestion/${otherIssuesSuggestion.id}/review`)
      .set(bearer(w.admin))
      .send({ action: "apply" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("SUGGESTION_NOT_FOUND");
  });
});

// ─── Clients never see AI data ───────────────────────────────────────────────

describe("AI data stays internal", () => {
  it("no client-facing issue endpoint includes suggestions or sentiment", async () => {
    await seedSuggestion();
    await seedSentiment();
    const responses = await Promise.all([
      request(app).get(`/api/issues/${w.issueA.id}`).set(bearer(w.clientA)),
      request(app).get(`/api/issues/${w.issueA.id}/feed`).set(bearer(w.clientA)),
      request(app).get("/api/issues").set(bearer(w.clientA)),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(EVIDENCE);
      expect(body).not.toContain(SENTIMENT_REASON);
      expect(body).not.toContain("Month-end is blocked");
      expect(body).not.toMatch(/frustration|escalation|aiSuggestion|aiSentiment/i);
    }
  });
});

// ─── Reviewing suggestions ───────────────────────────────────────────────────

describe("reviewing a suggestion", () => {
  const review = (suggestionId: bigint, body: object, user: User = w.engineerA) =>
    request(app)
      .post(`/api/issues/${w.issueA.id}/ai/suggestion/${suggestionId}/review`)
      .set(bearer(user))
      .send(body);

  it("applying as suggested records it as accepted and updates the issue through the normal rules", async () => {
    const suggestion = await seedSuggestion();
    const res = await review(suggestion.id, { action: "apply" });

    expect(res.status).toBe(200);
    expect(res.body.data.suggestion).toMatchObject({
      status: "accepted",
      applied: { impact: "high", urgency: "high", category: "file_handling", team: "backend" },
      reviewedBy: w.engineerA.id.toString(),
    });
    const issue = await prisma.issue.findUniqueOrThrow({ where: { id: w.issueA.id } });
    // Priority is recomputed by the ITIL matrix: high × high = critical
    expect(issue).toMatchObject({ urgency: "high", priority: "critical", category: "file_handling", team: "backend" });

    const activity = await prisma.issueActivity.findMany({
      where: { issueId: w.issueA.id },
      select: { fieldName: true, newValue: true, userId: true },
    });
    // Changes are attributed to the engineer who reviewed, not to the AI
    expect(activity.every((a) => a.userId === w.engineerA.id)).toBe(true);
    expect(activity.map((a) => [a.fieldName, a.newValue])).toEqual(
      expect.arrayContaining([
        ["urgency", "high"],
        ["priority", "critical"],
        ["category", "file_handling"],
        ["team", "backend"],
        ["aiTriage", "accepted"],
      ])
    );
  });

  it("changing any value records it as edited, with what was actually applied", async () => {
    const suggestion = await seedSuggestion();
    const res = await review(suggestion.id, { action: "apply", urgency: "medium", team: "web_frontend" });

    expect(res.body.data.suggestion).toMatchObject({
      status: "edited",
      applied: { impact: "high", urgency: "medium", category: "file_handling", team: "web_frontend" },
    });
    const issue = await prisma.issue.findUniqueOrThrow({ where: { id: w.issueA.id } });
    expect(issue).toMatchObject({ urgency: "medium", priority: "high", team: "web_frontend" });
  });

  it("rejecting leaves the issue untouched", async () => {
    const before = await prisma.issue.findUniqueOrThrow({ where: { id: w.issueA.id } });
    const suggestion = await seedSuggestion();
    const res = await review(suggestion.id, { action: "reject" });

    expect(res.status).toBe(200);
    expect(res.body.data.suggestion).toMatchObject({ status: "rejected", applied: null });
    expect(await prisma.issue.findUniqueOrThrow({ where: { id: w.issueA.id } })).toEqual(before);
  });

  it("a suggestion can only be reviewed once", async () => {
    const suggestion = await seedSuggestion();
    await review(suggestion.id, { action: "reject" });
    const second = await review(suggestion.id, { action: "apply" });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("SUGGESTION_ALREADY_REVIEWED");
  });

  it("two simultaneous reviews: exactly one wins", async () => {
    const suggestion = await seedSuggestion();
    const results = await Promise.all([
      review(suggestion.id, { action: "apply" }, w.engineerA),
      review(suggestion.id, { action: "reject" }, w.admin),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it("rejects an unknown action", async () => {
    const suggestion = await seedSuggestion();
    const res = await review(suggestion.id, { action: "approve" });
    expect(res.status).toBe(422);
  });
});

// ─── Retrying analysis ───────────────────────────────────────────────────────

describe("retrying an analysis", () => {
  const retry = (issueId = w.issueA.id) =>
    request(app).post(`/api/issues/${issueId}/ai/analyze`).set(bearer(w.engineerA));

  it("queues a new analysis after a failed one", async () => {
    await prisma.aiJob.create({
      data: { kind: "analyze_issue", issueId: w.issueA.id, companyId: w.companyA.id, maxAttempts: 3, status: "failed" },
    });
    const res = await retry();
    expect(res.status).toBe(202);
    expect(await prisma.aiJob.count({ where: { status: "queued" } })).toBe(1);

    const suggestion = await request(app).get(`/api/issues/${w.issueA.id}/ai/suggestion`).set(bearer(w.engineerA));
    expect(suggestion.body.data.analysis.status).toBe("queued");
  });

  it("refuses while an analysis is already queued", async () => {
    await retry();
    const second = await retry();
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("ANALYSIS_IN_PROGRESS");
  });

  it("only runs on issues raised by clients", async () => {
    const staffIssue = await prisma.issue.create({
      data: {
        ticketNumber: "ACME-0099",
        productId: w.productA.id,
        title: "Internal",
        description: "Staff-created",
        type: "bug",
        priority: "moderate",
        createdBy: w.engineerA.id,
      },
    });
    const res = await retry(staffIssue.id);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("NOT_A_CLIENT_ISSUE");
  });
});

// ─── Category and team on issues ─────────────────────────────────────────────

describe("issue category and team", () => {
  it("clients can't set them", async () => {
    const res = await request(app)
      .patch(`/api/issues/${w.issueA.id}`)
      .set(bearer(w.clientA))
      .send({ title: "Updated title", category: "performance", team: "infrastructure" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ title: "Updated title", category: null, team: null });
  });

  it("staff can set and clear them, and changes are logged", async () => {
    await request(app).patch(`/api/issues/${w.issueA.id}`).set(bearer(w.engineerA)).send({ category: "performance" });
    const cleared = await request(app)
      .patch(`/api/issues/${w.issueA.id}`)
      .set(bearer(w.engineerA))
      .send({ category: null });
    expect(cleared.body.data.category).toBeNull();

    const logged = await prisma.issueActivity.findMany({
      where: { fieldName: "category" },
      orderBy: { id: "asc" },
      select: { oldValue: true, newValue: true },
    });
    expect(logged).toEqual([
      { oldValue: null, newValue: "performance" },
      { oldValue: "performance", newValue: null },
    ]);
  });
});
