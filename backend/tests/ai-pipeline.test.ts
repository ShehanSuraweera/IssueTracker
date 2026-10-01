/**
 * The asynchronous AI pipeline: jobs are queued with the issue or comment,
 * and a worker sends them to the AI service and stores the results.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// env.ts is read at import time, so switch AI on before anything imports it
vi.hoisted(() => {
  process.env.AI_ENABLED = "true";
  process.env.AI_SERVICE_TOKEN = "stub-ai-service-token-0123456789abcdef";
});

import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { CircuitBreaker } from "../src/features/ai/ai.client";
import { backoffMs, processDueJobs, STALE_LOCK_MS } from "../src/features/ai/ai.worker";
import { bearer } from "./helpers/auth";
import { freshWorld, type World } from "./helpers/fixtures";
import {
  aiError,
  analyzeOk,
  clientFor,
  sentimentOk,
  startStubAiServer,
  STUB_TOKEN,
  unreachableUrl,
  type StubAiServer,
} from "./helpers/stub-ai-server";

const app = createApp();
const inOneHour = () => new Date(Date.now() + 60 * 60_000);

let w: World;
let stub: StubAiServer;

beforeEach(async () => {
  w = await freshWorld();
  stub = await startStubAiServer();
});

afterEach(async () => {
  await stub.close();
});

function queueAnalysis(maxAttempts = 3) {
  return prisma.aiJob.create({
    data: {
      kind: "analyze_issue",
      issueId: w.issueA.id,
      companyId: w.companyA.id,
      maxAttempts,
      nextAttemptAt: new Date(),
    },
  });
}

// ─── Enqueueing ──────────────────────────────────────────────────────────────

describe("queueing AI work", () => {
  it("a client creating an issue queues one analysis job and doesn't wait for the AI service", async () => {
    const res = await request(app)
      .post("/api/issues")
      .set(bearer(w.clientA))
      .send({ productId: w.productA.id.toString(), title: "Blank PDFs", description: "All invoices are blank.", type: "bug" });
    expect(res.status).toBe(201);

    const jobs = await prisma.aiJob.findMany();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      kind: "analyze_issue",
      status: "queued",
      issueId: BigInt(res.body.data.id),
      // Tenant copied from the product, never taken from the request
      companyId: w.companyA.id,
      commentId: null,
      attempts: 0,
      maxAttempts: 5,
    });
    // Nothing was sent to the AI service during the request
    expect(stub.requests).toHaveLength(0);
  });

  it("issues created by staff are not analysed", async () => {
    await request(app)
      .post("/api/issues")
      .set(bearer(w.engineerA))
      .send({ productId: w.productA.id.toString(), title: "Internal task", description: "Refactor.", type: "bug" });
    expect(await prisma.aiJob.count()).toBe(0);
  });

  it("client comments queue a sentiment job; staff comments don't", async () => {
    const clientComment = await request(app)
      .post(`/api/issues/${w.issueA.id}/comments`)
      .set(bearer(w.clientA))
      .send({ body: "Still broken." });
    await request(app).post(`/api/issues/${w.issueA.id}/comments`).set(bearer(w.engineerA)).send({ body: "On it." });
    await request(app)
      .post(`/api/issues/${w.issueA.id}/comments`)
      .set(bearer(w.engineerA))
      .send({ body: "Internal note", isInternal: true });

    const jobs = await prisma.aiJob.findMany();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      kind: "sentiment_comment",
      commentId: BigInt(clientComment.body.data.id),
      companyId: w.companyA.id,
    });
  });
});

// ─── Worker: success ─────────────────────────────────────────────────────────

describe("processing jobs", () => {
  it("stores the suggestion, the issue's sentiment and the call cost", async () => {
    const job = await queueAnalysis();
    stub.respond(200, analyzeOk());

    expect(await processDueJobs({ client: clientFor(stub.url) })).toBe(1);

    const suggestion = await prisma.aiSuggestion.findFirstOrThrow({ where: { issueId: w.issueA.id } });
    expect(suggestion).toMatchObject({
      companyId: w.companyA.id,
      status: "pending",
      suggestedImpact: "high",
      suggestedUrgency: "high",
      suggestedCategory: "file_handling",
      suggestedTeam: "backend",
      model: "gemini-3.5-flash-lite",
      promptVersion: "analyze-v1",
      manipulationAttempt: false,
    });
    const sentiment = await prisma.aiSentiment.findFirstOrThrow({ where: { issueId: w.issueA.id } });
    expect(sentiment).toMatchObject({ commentId: null, companyId: w.companyA.id, frustrationLevel: 4 });
    const log = await prisma.aiCallLog.findFirstOrThrow();
    expect(log).toMatchObject({
      feature: "analyze",
      status: "ok",
      inputTokens: 1128,
      outputTokens: 217,
      latencyMs: 912,
      jobId: job.id,
      companyId: w.companyA.id,
    });
    expect(await prisma.aiJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: "done",
      lockedBy: null,
    });
  });

  it("never changes the issue: triage stays a suggestion and sentiment never touches priority", async () => {
    const before = await prisma.issue.findUniqueOrThrow({ where: { id: w.issueA.id } });
    await queueAnalysis();
    // The angriest possible client and the most severe triage
    stub.respond(
      200,
      analyzeOk({
        triage: { impact: "high", urgency: "high" },
        sentiment: { sentiment: "negative", frustration_level: 5, escalation_risk: "high" },
      })
    );
    await processDueJobs({ client: clientFor(stub.url) });

    const after = await prisma.issue.findUniqueOrThrow({ where: { id: w.issueA.id } });
    // Every column, including updatedAt, is exactly as it was
    expect(after).toEqual(before);
    expect(await prisma.issueActivity.count({ where: { issueId: w.issueA.id } })).toBe(0);
  });

  it("sends the issue and product context with the service token and a traceable request ID", async () => {
    const job = await queueAnalysis();
    stub.respond(200, analyzeOk());
    await processDueJobs({ client: clientFor(stub.url) });

    const [sent] = stub.requests;
    expect(sent.path).toBe("/v1/analyze");
    expect(sent.headers.authorization).toBe(`Bearer ${STUB_TOKEN}`);
    expect(sent.headers["x-request-id"]).toBe(`ai-job-${job.id}-1`);
    expect(sent.body).toEqual({
      issue_type: "bug",
      title: w.issueA.title,
      description: w.issueA.description,
      product: { name: "Acme Portal", description: null },
    });
  });

  it("stores sentiment for a client comment", async () => {
    const comment = await prisma.issueComment.create({
      data: { issueId: w.issueA.id, userId: w.clientA.id, body: "Fix it by Friday or we will escalate." },
    });
    await prisma.aiJob.create({
      data: {
        kind: "sentiment_comment",
        issueId: w.issueA.id,
        commentId: comment.id,
        companyId: w.companyA.id,
        maxAttempts: 3,
      },
    });
    stub.respond(200, sentimentOk());
    await processDueJobs({ client: clientFor(stub.url) });

    expect(stub.requests[0].path).toBe("/v1/sentiment");
    expect(stub.requests[0].body).toEqual({ issue_title: w.issueA.title, comment: comment.body });
    expect(await prisma.aiSentiment.findFirstOrThrow()).toMatchObject({
      commentId: comment.id,
      frustrationLevel: 5,
      escalationRisk: "high",
      promptVersion: "sentiment-v1",
    });
  });

  it("a new analysis supersedes a suggestion nobody reviewed", async () => {
    await queueAnalysis();
    stub.respond(200, analyzeOk());
    await processDueJobs({ client: clientFor(stub.url) });
    await queueAnalysis();
    stub.respond(200, analyzeOk({ triage: { impact: "medium" } }));
    await processDueJobs({ client: clientFor(stub.url) });

    const statuses = await prisma.aiSuggestion.findMany({ orderBy: { id: "asc" }, select: { status: true } });
    expect(statuses).toEqual([{ status: "superseded" }, { status: "pending" }]);
  });
});

// ─── Worker: failures ────────────────────────────────────────────────────────

describe("handling failures", () => {
  it("retries a retryable failure later, and logs the attempt with its cost", async () => {
    const job = await queueAnalysis();
    stub.respond(503, aiError("LLM_RATE_LIMITED", true));
    const started = Date.now();
    await processDueJobs({ client: clientFor(stub.url) });

    const after = await prisma.aiJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.status).toBe("queued");
    expect(after.attempts).toBe(1);
    expect(after.lastError).toMatch(/^LLM_RATE_LIMITED/);
    // First retry waits 30s ± 20%
    expect(after.nextAttemptAt.getTime() - started).toBeGreaterThanOrEqual(24_000);
    expect(await prisma.aiCallLog.findFirstOrThrow()).toMatchObject({
      status: "LLM_RATE_LIMITED",
      inputTokens: 1128,
    });
    expect(await prisma.aiSuggestion.count()).toBe(0);
  });

  it("marks the job failed once its attempts run out", async () => {
    const job = await queueAnalysis(2);
    stub.respond(503, aiError("LLM_UNAVAILABLE", true));
    stub.respond(503, aiError("LLM_UNAVAILABLE", true));
    await processDueJobs({ client: clientFor(stub.url) });
    await processDueJobs({ client: clientFor(stub.url), now: inOneHour });

    expect(await prisma.aiJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: "failed",
      attempts: 2,
    });
  });

  it("fails at once on an error that retrying can't fix", async () => {
    const job = await queueAnalysis();
    stub.respond(422, aiError("LLM_BLOCKED", false));
    await processDueJobs({ client: clientFor(stub.url) });

    expect(await prisma.aiJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: "failed",
      attempts: 1,
    });
  });

  it("retries when the AI service is down", async () => {
    const job = await queueAnalysis();
    await processDueJobs({ client: clientFor(await unreachableUrl()) });

    const after = await prisma.aiJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.status).toBe("queued");
    expect(after.lastError).toMatch(/^AI_SERVICE_UNREACHABLE/);
  });

  it("gives up on a slow response after the timeout and retries later", async () => {
    const job = await queueAnalysis();
    stub.respond(200, analyzeOk(), 3_000);
    await processDueJobs({ client: clientFor(stub.url, { timeoutMs: 200 }) });

    const after = await prisma.aiJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.status).toBe("queued");
    expect(after.lastError).toMatch(/^AI_SERVICE_TIMEOUT/);
  });

  it("rejects a response from the AI service that fails validation", async () => {
    const job = await queueAnalysis();
    stub.respond(200, analyzeOk({ triage: { impact: "critical" } }));
    await processDueJobs({ client: clientFor(stub.url) });

    expect((await prisma.aiJob.findUniqueOrThrow({ where: { id: job.id } })).lastError).toMatch(
      /^AI_SERVICE_BAD_RESPONSE/
    );
    expect(await prisma.aiSuggestion.count()).toBe(0);
  });

  it("stops calling while the circuit breaker is open, without using up attempts", async () => {
    const first = await queueAnalysis();
    const second = await queueAnalysis();
    const client = clientFor(await unreachableUrl(), { breaker: new CircuitBreaker(1, 60_000) });

    await processDueJobs({ client });
    // The first failure opened the circuit, so the second job wasn't sent
    expect(await prisma.aiJob.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ attempts: 1 });
    expect(await prisma.aiJob.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({
      status: "queued",
      attempts: 0,
    });
    // While open, the worker doesn't claim anything
    expect(await processDueJobs({ client, now: inOneHour })).toBe(0);
    expect(await prisma.aiCallLog.count()).toBe(1);
  });
});

// ─── Worker: concurrency ─────────────────────────────────────────────────────

describe("concurrency", () => {
  it("two workers running at once never process the same job", async () => {
    await queueAnalysis();
    stub.respond(200, analyzeOk());
    stub.respond(200, analyzeOk());
    const client = clientFor(stub.url);

    const claimed = await Promise.all([
      processDueJobs({ client, workerId: "worker-1" }),
      processDueJobs({ client, workerId: "worker-2" }),
    ]);

    expect(claimed.reduce((a, b) => a + b)).toBe(1);
    expect(stub.requests).toHaveLength(1);
    expect(await prisma.aiSuggestion.count()).toBe(1);
  });

  it("skips a job another worker holds, instead of waiting for it or taking it too", async () => {
    // Deterministic version of the race above: this test holds a row lock on
    // the job, as a worker mid-claim would, and checks the worker skips it.
    // Without FOR UPDATE SKIP LOCKED the claim would block on the lock and
    // then claim the job a second time once it was released.
    const job = await queueAnalysis();
    let release!: () => void;
    let markLocked!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    const locked = new Promise<void>((resolve) => (markLocked = resolve));

    const otherWorker = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM ai_jobs WHERE id = ${job.id} FOR UPDATE`;
        markLocked();
        await released;
      },
      { timeout: 20_000 }
    );
    await locked;

    const outcome = await Promise.race([
      processDueJobs({ client: clientFor(stub.url) }),
      new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), 3_000)),
    ]);
    release();
    await otherWorker;

    expect(outcome).toBe(0);
    expect(stub.requests).toHaveLength(0);
  });

  it("reclaims a job whose worker died mid-run", async () => {
    const job = await queueAnalysis();
    await prisma.aiJob.update({
      where: { id: job.id },
      data: {
        status: "running",
        attempts: 1,
        lockedBy: "crashed-worker",
        lockedAt: new Date(Date.now() - STALE_LOCK_MS - 60_000),
      },
    });
    stub.respond(200, analyzeOk());
    await processDueJobs({ client: clientFor(stub.url) });

    expect(await prisma.aiJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: "done",
      attempts: 2,
    });
  });

  it("leaves a job alone while its worker's lock is fresh", async () => {
    const job = await queueAnalysis();
    await prisma.aiJob.update({
      where: { id: job.id },
      data: { status: "running", attempts: 1, lockedBy: "busy-worker", lockedAt: new Date() },
    });
    expect(await processDueJobs({ client: clientFor(stub.url) })).toBe(0);
  });
});

// ─── Pure helpers ────────────────────────────────────────────────────────────

describe("backoff", () => {
  it("doubles from 30s and caps at 15 minutes, with ±20% jitter", () => {
    expect(backoffMs(1, () => 0.5)).toBe(30_000);
    expect(backoffMs(2, () => 0.5)).toBe(60_000);
    expect(backoffMs(3, () => 0.5)).toBe(120_000);
    expect(backoffMs(20, () => 0.5)).toBe(15 * 60_000);
    expect(backoffMs(1, () => 0)).toBe(24_000);
    expect(backoffMs(1, () => 0.999999)).toBeLessThanOrEqual(36_000);
  });
});

describe("circuit breaker", () => {
  it("opens after the threshold, closes after a successful trial, reopens if the trial fails", () => {
    let now = 0;
    const breaker = new CircuitBreaker(3, 1_000, () => now);

    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.isOpen()).toBe(false);
    breaker.recordFailure();
    expect(breaker.isOpen()).toBe(true);

    now = 1_000; // cooldown over: the next call is a trial
    expect(breaker.isOpen()).toBe(false);
    breaker.recordFailure(); // trial fails: open again immediately
    expect(breaker.isOpen()).toBe(true);

    now = 2_000;
    breaker.recordSuccess(); // trial succeeds: fully closed
    breaker.recordFailure();
    expect(breaker.isOpen()).toBe(false);
  });
});
