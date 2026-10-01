/**
 * A stand-in for the Python AI service: a real HTTP server on a random port
 * that returns scripted responses and records every request. Tests exercise
 * the backend's real HTTP client against it, without mocking fetch.
 */
import http from "http";
import type { AddressInfo } from "net";
import { CircuitBreaker, createAiClient, type AiClient } from "../../src/features/ai/ai.client";

export const STUB_TOKEN = "stub-ai-service-token-0123456789abcdef";

export interface RecordedRequest {
  path: string;
  headers: http.IncomingHttpHeaders;
  body: any;
}

interface Scripted {
  status: number;
  body: unknown;
  delayMs: number;
}

export interface StubAiServer {
  url: string;
  requests: RecordedRequest[];
  respond(status: number, body: unknown, delayMs?: number): void;
  close(): Promise<void>;
}

export async function startStubAiServer(): Promise<StubAiServer> {
  const queue: Scripted[] = [];
  const requests: RecordedRequest[] = [];

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      requests.push({ path: req.url ?? "", headers: req.headers, body: raw ? JSON.parse(raw) : undefined });
      const next = queue.shift() ?? {
        status: 500,
        body: { error: { code: "STUB_NOTHING_QUEUED", message: "no response queued", retryable: false } },
        delayMs: 0,
      };
      setTimeout(() => {
        if (res.destroyed) return;
        res.writeHead(next.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(next.body));
      }, next.delayMs);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    respond: (status, body, delayMs = 0) => queue.push({ status, body, delayMs }),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** A client for the stub. The breaker threshold is high so it only trips in tests that want it to. */
export function clientFor(
  url: string,
  options: { timeoutMs?: number; breaker?: CircuitBreaker } = {}
): AiClient {
  return createAiClient({
    baseUrl: url,
    token: STUB_TOKEN,
    timeoutMs: options.timeoutMs ?? 5_000,
    breaker: options.breaker ?? new CircuitBreaker(1_000, 60_000),
  });
}

/** A URL where nothing is listening. */
export async function unreachableUrl(): Promise<string> {
  const stub = await startStubAiServer();
  await stub.close();
  return stub.url;
}

// ─── Response builders ───────────────────────────────────────────────────────

export const META = {
  provider: "gemini",
  model: "gemini-3.5-flash-lite",
  prompt_version: "analyze-v1",
  latency_ms: 912,
  input_tokens: 1128,
  output_tokens: 217,
  thinking_tokens: null,
};

export function analyzeOk(overrides: { triage?: object; sentiment?: object; manipulation_attempt?: boolean } = {}) {
  return {
    result: {
      triage: {
        impact: "high",
        impact_reason: "All invoice exports fail for the accounting team.",
        urgency: "high",
        urgency_reason: "Month-end closing is blocked.",
        category: "file_handling",
        category_reason: "The problem is in PDF export.",
        team: "backend",
        team_reason: "PDF generation runs on the server.",
        ...overrides.triage,
      },
      sentiment: {
        sentiment: "negative",
        frustration_level: 4,
        escalation_risk: "medium",
        evidence_quote: "Every invoice exported since Monday",
        reason: "The client reports a persistent failure.",
        ...overrides.sentiment,
      },
      manipulation_attempt: overrides.manipulation_attempt ?? false,
    },
    meta: META,
  };
}

export function sentimentOk(overrides: object = {}) {
  return {
    result: {
      sentiment: {
        sentiment: "negative",
        frustration_level: 5,
        escalation_risk: "high",
        evidence_quote: "we will escalate",
        reason: "The client threatens escalation.",
        ...overrides,
      },
      manipulation_attempt: false,
    },
    meta: { ...META, prompt_version: "sentiment-v1", input_tokens: 560, output_tokens: 90 },
  };
}

export function aiError(code: string, retryable: boolean, withMeta = true) {
  return {
    error: { code, message: `${code} from stub`, retryable },
    ...(withMeta && { meta: { ...META, output_tokens: 0 } }),
  };
}
