/**
 * HTTP client for the internal Python AI service.
 *
 * Every failure becomes an AiServiceError carrying `retryable`, so the job
 * worker can decide whether to try again. A circuit breaker stops calls for a
 * cooldown period after repeated outages, so queued jobs don't each wait out
 * a full timeout while the service is down.
 */
import type { ZodType } from "zod";
import { env } from "../../config/env";
import {
  AnalyzeResponseSchema,
  ErrorResponseSchema,
  SentimentResponseSchema,
  type AnalyzeResponse,
  type ErrorMeta,
  type SentimentResponse,
} from "./ai.schemas";

export interface AnalyzeRequestBody {
  issue_type: "bug" | "feature_request" | "question" | "incident";
  title: string;
  description: string;
  product: { name: string; description: string | null };
}

export interface SentimentRequestBody {
  issue_title: string;
  comment: string;
}

export interface AiCallContext {
  // Sent as X-Request-ID so one ID appears in both services' logs
  requestId: string;
}

export interface AiClient {
  analyze(body: AnalyzeRequestBody, ctx: AiCallContext): Promise<AnalyzeResponse>;
  sentiment(body: SentimentRequestBody, ctx: AiCallContext): Promise<SentimentResponse>;
  // False while the circuit breaker is open
  isAvailable(): boolean;
}

export class AiServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly info: { status?: number; detail?: string; meta?: ErrorMeta } = {}
  ) {
    super(message);
    this.name = "AiServiceError";
  }
}

// Failures that mean "the service or its provider is unavailable right now",
// as opposed to one bad answer (e.g. LLM_INVALID_OUTPUT)
const OUTAGE_CODES = new Set([
  "AI_SERVICE_UNREACHABLE",
  "AI_SERVICE_TIMEOUT",
  "AI_SERVICE_ERROR",
  "LLM_TIMEOUT",
  "LLM_UNAVAILABLE",
  "LLM_RATE_LIMITED",
]);

export class CircuitBreaker {
  private consecutiveFailures = 0;
  private openUntil = 0;

  constructor(
    private readonly failureThreshold: number,
    private readonly cooldownMs: number,
    private readonly now: () => number = Date.now
  ) {}

  isOpen(): boolean {
    return this.now() < this.openUntil;
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openUntil = 0;
  }

  recordFailure(): void {
    // After a cooldown the next call is a trial: one more failure reopens at once
    const trialFailed = this.openUntil > 0 && !this.isOpen();
    this.consecutiveFailures += 1;
    if (trialFailed || this.consecutiveFailures >= this.failureThreshold) {
      this.openUntil = this.now() + this.cooldownMs;
      this.consecutiveFailures = 0;
    }
  }
}

export interface AiClientOptions {
  baseUrl: string;
  token: string;
  timeoutMs: number;
  breaker?: CircuitBreaker;
}

export function createAiClient(options: AiClientOptions): AiClient {
  const breaker = options.breaker ?? new CircuitBreaker(3, 30_000);

  async function post<T>(
    path: string,
    body: unknown,
    schema: ZodType<T>,
    ctx: AiCallContext
  ): Promise<T> {
    if (breaker.isOpen()) {
      throw new AiServiceError(
        "AI_CIRCUIT_OPEN",
        "AI service paused after repeated failures",
        true
      );
    }
    try {
      const result = await send(path, body, schema, ctx);
      breaker.recordSuccess();
      return result;
    } catch (err) {
      if (err instanceof AiServiceError && OUTAGE_CODES.has(err.code)) breaker.recordFailure();
      else breaker.recordSuccess(); // the service answered; it's up
      throw err;
    }
  }

  async function send<T>(
    path: string,
    body: unknown,
    schema: ZodType<T>,
    ctx: AiCallContext
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(new URL(path, options.baseUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.token}`,
          "Content-Type": "application/json",
          "X-Request-ID": ctx.requestId,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new AiServiceError(
          "AI_SERVICE_TIMEOUT",
          `No response within ${options.timeoutMs}ms`,
          true
        );
      }
      throw new AiServiceError("AI_SERVICE_UNREACHABLE", "Could not reach the AI service", true);
    }

    const json: unknown = await response.json().catch(() => undefined);

    if (response.ok) {
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        throw new AiServiceError(
          "AI_SERVICE_BAD_RESPONSE",
          "AI service response failed validation",
          true,
          { status: response.status }
        );
      }
      return parsed.data;
    }

    const error = ErrorResponseSchema.safeParse(json);
    if (error.success) {
      const { code, message, retryable, detail } = error.data.error;
      throw new AiServiceError(code, message, retryable, {
        status: response.status,
        detail,
        meta: error.data.meta,
      });
    }
    throw new AiServiceError(
      "AI_SERVICE_ERROR",
      `AI service returned ${response.status}`,
      response.status >= 500,
      { status: response.status }
    );
  }

  return {
    analyze: (body, ctx) => post("/v1/analyze", body, AnalyzeResponseSchema, ctx),
    sentiment: (body, ctx) => post("/v1/sentiment", body, SentimentResponseSchema, ctx),
    isAvailable: () => !breaker.isOpen(),
  };
}

let defaultClient: AiClient | undefined;

/** The client configured from environment variables. */
export function getDefaultAiClient(): AiClient {
  if (!env.AI_SERVICE_TOKEN) {
    throw new Error("AI_SERVICE_TOKEN is not configured");
  }
  defaultClient ??= createAiClient({
    baseUrl: env.AI_SERVICE_URL,
    token: env.AI_SERVICE_TOKEN,
    timeoutMs: env.AI_TIMEOUT_MS,
  });
  return defaultClient;
}
