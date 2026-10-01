/**
 * Similar issues and suggested resolutions: keeping the index in sync, the
 * staff endpoints, and the rule that AI never shows an issue the viewer
 * couldn't open.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_ENABLED = "true";
  process.env.AI_SERVICE_TOKEN = "stub-ai-service-token-0123456789abcdef";
});

import request from "supertest";
import type { Products, User } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { setDefaultAiClient } from "../src/features/ai/ai.client";
import { processDueJobs } from "../src/features/ai/ai.worker";
import { bearer } from "./helpers/auth";
import { freshWorld, type World } from "./helpers/fixtures";
import {
  META,
  aiError,
  clientFor,
  startStubAiServer,
  type StubAiServer,
} from "./helpers/stub-ai-server";

const app = createApp();
let w: World;
let stub: StubAiServer;
// A second Acme product that engineerA has no access to
let productA2: Products;

beforeEach(async () => {
  w = await freshWorld();
  stub = await startStubAiServer();
  setDefaultAiClient(clientFor(stub.url));
  productA2 = await prisma.products.create({
    data: { companyId: w.companyA.id, name: "Acme Admin Console", code: "ACMEADM", owningOffice: "LK" },
  });
});

afterEach(async () => {
  setDefaultAiClient(undefined);
  await stub.close();
});

let ticketCounter = 100;
async function resolvedIssue(productId: bigint, title: string, status: "resolved" | "closed" | "in_progress" = "resolved") {
  ticketCounter += 1;
  const issue = await prisma.issue.create({
    data: {
      ticketNumber: `ACME-${String(ticketCounter).padStart(4, "0")}`,
      productId,
      title,
      description: `${title}. Happens every time.`,
      type: "bug",
      priority: "moderate",
      status,
      createdBy: w.clientA.id,
      resolvedAt: status === "resolved" ? new Date("2026-09-01T10:00:00Z") : null,
    },
  });
  await prisma.issueComment.createMany({
    data: [
      { issueId: issue.id, userId: w.clientA.id, body: "CLIENT: still broken for us" },
      { issueId: issue.id, userId: w.engineerA.id, body: "Root cause: stale cache.", isInternal: true },
      { issueId: issue.id, userId: w.engineerA.id, body: "Fixed in v2.3.1." },
    ],
  });
  return issue;
}

const indexJobs = () => prisma.aiJob.findMany({ where: { kind: "index_issue" } });

function similarResult(issueId: bigint | number, ticket: string, similarity = 0.9) {
  return { issue_id: Number(issueId), ticket_number: ticket, title: "t", similarity };
}

// ─── Keeping the index in sync ───────────────────────────────────────────────

describe("index sync jobs", () => {
  it("resolving an issue queues an index sync", async () => {
    await request(app).patch(`/api/issues/${w.issueA.id}`).set(bearer(w.engineerA)).send({ status: "in_progress" });
    expect(await indexJobs()).toHaveLength(0);
    await request(app).post(`/api/issues/${w.issueA.id}/resolve`).set(bearer(w.engineerA));

    const jobs = await indexJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ issueId: w.issueA.id, companyId: w.companyA.id, status: "queued" });
  });

  it("reopening queues a sync, but never a second one while one is still queued", async () => {
    const issue = await resolvedIssue(w.productA.id, "Login fails");
    await request(app).patch(`/api/issues/${issue.id}`).set(bearer(w.engineerA)).send({ status: "in_progress" });
    await request(app).patch(`/api/issues/${issue.id}`).set(bearer(w.engineerA)).send({ status: "resolved" });
    expect(await indexJobs()).toHaveLength(1);
  });

  it("editing a resolved issue's text queues a sync; editing an open issue's doesn't", async () => {
    await request(app).patch(`/api/issues/${w.issueA.id}`).set(bearer(w.engineerA)).send({ title: "Open issue renamed" });
    expect(await indexJobs()).toHaveLength(0);

    const issue = await resolvedIssue(w.productA.id, "Login fails");
    await request(app).patch(`/api/issues/${issue.id}`).set(bearer(w.engineerA)).send({ title: "Login fails on Safari" });
    expect(await indexJobs()).toHaveLength(1);
  });

  it("a staff comment on a resolved issue queues a sync; a client comment doesn't", async () => {
    const issue = await resolvedIssue(w.productA.id, "Login fails");
    await request(app).post(`/api/issues/${issue.id}/comments`).set(bearer(w.clientA)).send({ body: "Thanks!" });
    expect(await indexJobs()).toHaveLength(0);
    await request(app).post(`/api/issues/${issue.id}/comments`).set(bearer(w.engineerA)).send({ body: "Also patched v2.3.2." });
    expect(await indexJobs()).toHaveLength(1);
  });
});

describe("index sync worker", () => {
  async function queueSync(issueId: bigint) {
    return prisma.aiJob.create({
      data: { kind: "index_issue", issueId, companyId: w.companyA.id, maxAttempts: 3, nextAttemptAt: new Date() },
    });
  }

  it("indexes a resolved issue, with staff comments as the resolution notes", async () => {
    const issue = await resolvedIssue(w.productA.id, "Login fails");
    const job = await queueSync(issue.id);
    stub.respond(200, { indexed: true, embedded: true, embedding_model: "bge" });
    await processDueJobs({ client: clientFor(stub.url) });

    const [sent] = stub.requests;
    expect(sent.path).toBe(`/v1/documents/${issue.id}`);
    expect(sent.body).toEqual({
      company_id: Number(w.companyA.id),
      product_id: Number(w.productA.id),
      ticket_number: issue.ticketNumber,
      title: "Login fails",
      problem: "Login fails. Happens every time.",
      resolution: "Root cause: stale cache.\n\nFixed in v2.3.1.",
      resolved_at: "2026-09-01T10:00:00.000Z",
    });
    expect(sent.body.resolution).not.toContain("CLIENT:");
    expect(await prisma.aiJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "done" });
    expect(await prisma.aiCallLog.findFirstOrThrow()).toMatchObject({ feature: "index", status: "ok" });
  });

  it("removes an issue that is no longer resolved, scoped to its company", async () => {
    const issue = await resolvedIssue(w.productA.id, "Login fails", "in_progress");
    await queueSync(issue.id);
    stub.respond(200, { deleted: true });
    await processDueJobs({ client: clientFor(stub.url) });

    expect(stub.requests[0].path).toBe(`/v1/documents/${issue.id}?company_id=${w.companyA.id}`);
    expect(stub.requests[0].headers).toMatchObject({ authorization: expect.stringMatching(/^Bearer /) });
  });
});

// ─── Similar issues ──────────────────────────────────────────────────────────

describe("GET /issues/:id/ai/similar", () => {
  const getSimilar = (user: User) =>
    request(app).get(`/api/issues/${w.issueA.id}/ai/similar`).set(bearer(user));

  it("scopes the search to the issue's company and the viewer's products", async () => {
    stub.respond(200, { results: [], embedding_model: "bge", min_similarity: 0.7 });
    await getSimilar(w.engineerA);
    stub.respond(200, { results: [], embedding_model: "bge", min_similarity: 0.7 });
    await getSimilar(w.admin);

    const [asEngineer, asAdmin] = stub.requests.map((r) => r.body);
    expect(asEngineer).toMatchObject({
      company_id: Number(w.companyA.id),
      // engineerA can open ACME but not ACMEADM, so only ACME is searched
      product_ids: [Number(w.productA.id)],
      exclude_issue_id: Number(w.issueA.id),
      title: w.issueA.title,
    });
    expect(asAdmin.company_id).toBe(Number(w.companyA.id));
    expect(asAdmin.product_ids).toBeUndefined();
  });

  it("drops every result the viewer couldn't open, whatever the AI service returns", async () => {
    const visible = await resolvedIssue(w.productA.id, "Login fails");
    const otherProduct = await resolvedIssue(productA2.id, "Login fails on admin console");
    const reopened = await resolvedIssue(w.productA.id, "Login fails again", "in_progress");
    const otherCompany = await prisma.issue.update({
      where: { id: w.issueB.id },
      data: { status: "resolved", resolvedAt: new Date() },
    });
    // A compromised or buggy index returning things it shouldn't
    stub.respond(200, {
      results: [
        similarResult(visible.id, visible.ticketNumber, 0.95),
        similarResult(otherProduct.id, otherProduct.ticketNumber),
        similarResult(reopened.id, reopened.ticketNumber),
        similarResult(otherCompany.id, otherCompany.ticketNumber),
        similarResult(999_999, "ACME-9999"),
      ],
      embedding_model: "bge",
      min_similarity: 0.7,
    });

    const res = await getSimilar(w.engineerA);
    expect(res.status).toBe(200);
    expect(res.body.data.results).toEqual([
      expect.objectContaining({
        issueId: String(visible.id),
        ticketNumber: visible.ticketNumber,
        status: "resolved",
        productName: "Acme Portal",
        similarity: 0.95,
      }),
    ]);
  });

  it("drops another company's issue even for an admin, who has no product restriction", async () => {
    const otherCompany = await prisma.issue.update({
      where: { id: w.issueB.id },
      data: { status: "resolved", resolvedAt: new Date() },
    });
    stub.respond(200, {
      results: [similarResult(otherCompany.id, otherCompany.ticketNumber)],
      embedding_model: "bge",
      min_similarity: 0.7,
    });
    const res = await getSimilar(w.admin);
    expect(res.body.data.results).toEqual([]);
  });

  it("is closed to clients and to engineers without access, before any AI call", async () => {
    expect((await getSimilar(w.clientA)).status).toBe(403);
    const outsider = await getSimilar(w.engineerB);
    expect(outsider.status).toBe(404);
    expect(outsider.body.error.code).toBe("ISSUE_NOT_FOUND");
    expect(stub.requests).toHaveLength(0);
  });

  it("reports the AI service being down as 503, without failing anything else", async () => {
    stub.respond(503, aiError("RETRIEVAL_DATABASE_UNAVAILABLE", true, false));
    const res = await getSimilar(w.engineerA);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("AI_UNAVAILABLE");
  });
});

// ─── Suggested resolutions ───────────────────────────────────────────────────

describe("suggested resolutions", () => {
  const resolutionPath = () => `/api/issues/${w.issueA.id}/ai/resolution`;

  function resolutionResponse(sources: object[], cited: string[], meta: object | null = { ...META, prompt_version: "resolution-v1" }) {
    return {
      result: {
        has_relevant_history: true,
        summary: "Same stale-cache problem as before.",
        steps: ["Clear the cache.", "Ship v2.3.1."],
        cited_tickets: cited,
        confidence: "high",
        manipulation_attempt: false,
      },
      sources,
      meta,
    };
  }

  it("stores the suggestion with its model and prompt version, and logs the call's cost", async () => {
    const past = await resolvedIssue(w.productA.id, "Login fails");
    stub.respond(200, resolutionResponse([similarResult(past.id, past.ticketNumber)], [past.ticketNumber]));

    const res = await request(app).post(resolutionPath()).set(bearer(w.engineerA));
    expect(res.status).toBe(201);
    expect(res.body.data.suggestion).toMatchObject({
      hasRelevantHistory: true,
      citedTickets: [past.ticketNumber],
      model: "gemini-3.5-flash-lite",
      promptVersion: "resolution-v1",
      feedback: null,
    });
    expect(res.body.data.suggestion.sources).toEqual([
      expect.objectContaining({ ticketNumber: past.ticketNumber, issueId: String(past.id) }),
    ]);
    expect(await prisma.aiCallLog.findFirstOrThrow()).toMatchObject({
      feature: "resolution",
      status: "ok",
      inputTokens: 1128,
      issueId: w.issueA.id,
    });

    const latest = await request(app).get(resolutionPath()).set(bearer(w.admin));
    expect(latest.body.data.suggestion.id).toBe(res.body.data.suggestion.id);
  });

  it("removes sources and citations the viewer couldn't open", async () => {
    const visible = await resolvedIssue(w.productA.id, "Login fails");
    const hidden = await resolvedIssue(productA2.id, "Login fails on admin console");
    stub.respond(
      200,
      resolutionResponse(
        [similarResult(visible.id, visible.ticketNumber), similarResult(hidden.id, hidden.ticketNumber)],
        [visible.ticketNumber, hidden.ticketNumber]
      )
    );
    const res = await request(app).post(resolutionPath()).set(bearer(w.engineerA));
    const suggestion = res.body.data.suggestion;
    expect(suggestion.citedTickets).toEqual([visible.ticketNumber]);
    expect(suggestion.sources.map((s: { ticketNumber: string }) => s.ticketNumber)).toEqual([visible.ticketNumber]);
  });

  it("without similar history nothing is stored", async () => {
    stub.respond(200, {
      result: {
        has_relevant_history: false,
        summary: "No similar resolved issues were found for this company.",
        steps: [],
        cited_tickets: [],
        confidence: "low",
        manipulation_attempt: false,
      },
      sources: [],
      meta: null,
    });
    const res = await request(app).post(resolutionPath()).set(bearer(w.engineerA));
    expect(res.body.data.suggestion).toMatchObject({ id: null, hasRelevantHistory: false });
    expect(await prisma.aiResolutionSuggestion.count()).toBe(0);
  });

  it("a failed generation still logs what it cost, and returns 503", async () => {
    stub.respond(502, aiError("LLM_INVALID_OUTPUT", true));
    const res = await request(app).post(resolutionPath()).set(bearer(w.engineerA));
    expect(res.status).toBe(503);
    expect(await prisma.aiCallLog.findFirstOrThrow()).toMatchObject({
      feature: "resolution",
      status: "LLM_INVALID_OUTPUT",
      inputTokens: 1128,
    });
  });

  it("records feedback once; a second attempt is refused", async () => {
    const past = await resolvedIssue(w.productA.id, "Login fails");
    stub.respond(200, resolutionResponse([similarResult(past.id, past.ticketNumber)], [past.ticketNumber]));
    const created = await request(app).post(resolutionPath()).set(bearer(w.engineerA));
    const feedbackPath = `${resolutionPath()}/${created.body.data.suggestion.id}/feedback`;

    const first = await request(app).post(feedbackPath).set(bearer(w.engineerA)).send({ feedback: "helpful" });
    expect(first.status).toBe(200);
    expect(first.body.data.suggestion.feedback).toBe("helpful");
    const second = await request(app).post(feedbackPath).set(bearer(w.admin)).send({ feedback: "not_helpful" });
    expect(second.status).toBe(409);
    expect((await prisma.aiResolutionSuggestion.findFirstOrThrow()).feedbackBy).toBe(w.engineerA.id);
  });

  it("is closed to clients and engineers without access", async () => {
    for (const [user, status] of [[w.clientA, 403], [w.clientB, 403], [w.engineerB, 404]] as const) {
      expect((await request(app).post(resolutionPath()).set(bearer(user))).status).toBe(status);
      expect((await request(app).get(resolutionPath()).set(bearer(user))).status).toBe(status);
    }
    expect(stub.requests).toHaveLength(0);
  });
});
