import { z } from "zod";
import {
  EngineeringTeamEnum,
  ImpactLevelEnum,
  IssueCategoryEnum,
  UrgencyLevelEnum,
} from "../issues/issues.schemas";

// ─── AI service responses ────────────────────────────────────────────────────
// The AI service already validates model output, but this backend checks every
// response again before storing it. An internal service is trusted, not
// blindly: a bug or version mismatch there must not write bad data here.
// Unknown extra fields are ignored so the AI service can add fields without
// breaking this backend.

const Level = z.enum(["low", "medium", "high"]);
const ShortText = z.string().min(1).max(300);

const CallMetaSchema = z.object({
  provider: z.string().min(1).max(32),
  model: z.string().min(1).max(64),
  prompt_version: z.string().min(1).max(32),
  latency_ms: z.number().int().nonnegative(),
  input_tokens: z.number().int().nonnegative().nullable(),
  output_tokens: z.number().int().nonnegative().nullable(),
  thinking_tokens: z.number().int().nonnegative().nullable(),
});
export type CallMeta = z.infer<typeof CallMetaSchema>;

const SentimentSchema = z.object({
  sentiment: z.enum(["negative", "neutral", "positive"]),
  frustration_level: z.number().int().min(1).max(5),
  escalation_risk: Level,
  evidence_quote: ShortText,
  reason: ShortText,
});

export const AnalyzeResponseSchema = z.object({
  result: z.object({
    triage: z.object({
      impact: Level,
      impact_reason: ShortText,
      urgency: Level,
      urgency_reason: ShortText,
      category: IssueCategoryEnum,
      category_reason: ShortText,
      team: EngineeringTeamEnum,
      team_reason: ShortText,
    }),
    sentiment: SentimentSchema,
    manipulation_attempt: z.boolean(),
  }),
  meta: CallMetaSchema,
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

export const SentimentResponseSchema = z.object({
  result: z.object({
    sentiment: SentimentSchema,
    manipulation_attempt: z.boolean(),
  }),
  meta: CallMetaSchema,
});
export type SentimentResponse = z.infer<typeof SentimentResponseSchema>;

// Error envelope. meta is present when an LLM call happened (it may have cost tokens).
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1).max(40),
    message: z.string().max(500),
    retryable: z.boolean(),
    detail: z.string().max(64).optional(),
  }),
  meta: z
    .object({
      provider: z.string().max(32).nullable(),
      model: z.string().max(64).nullable(),
      prompt_version: z.string().max(32).nullable(),
      latency_ms: z.number().int().nonnegative().nullable(),
      input_tokens: z.number().int().nonnegative().nullable(),
      output_tokens: z.number().int().nonnegative().nullable(),
      thinking_tokens: z.number().int().nonnegative().nullable(),
    })
    .partial()
    .optional(),
});
export type ErrorMeta = NonNullable<z.infer<typeof ErrorResponseSchema>["meta"]>;

// ─── API request bodies ──────────────────────────────────────────────────────

// "apply" uses the suggested value for any field left out. Whether the result
// counts as accepted or edited is decided by the server, from the data.
export const ReviewSuggestionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("apply"),
    impact: ImpactLevelEnum.optional(),
    urgency: UrgencyLevelEnum.optional(),
    category: IssueCategoryEnum.optional(),
    team: EngineeringTeamEnum.optional(),
  }),
  z.object({ action: z.literal("reject") }),
]);
export type ReviewSuggestionInput = z.infer<typeof ReviewSuggestionSchema>;

// ─── Retrieval responses ─────────────────────────────────────────────────────

export const DocumentResponseSchema = z.object({
  indexed: z.boolean(),
  embedded: z.boolean(),
  embedding_model: z.string().max(64),
});

export const DeleteDocumentResponseSchema = z.object({ deleted: z.boolean() });

export const DocumentListResponseSchema = z.object({
  documents: z.array(
    z.object({ company_id: z.number().int().positive(), issue_id: z.number().int().positive() })
  ),
});

const TicketNumber = z.string().regex(/^[A-Z0-9]{2,8}-\d{4,}$/);

const SimilarIssueSchema = z.object({
  issue_id: z.number().int().positive(),
  ticket_number: TicketNumber,
  title: z.string().min(1).max(200),
  similarity: z.number().min(-1).max(1),
});
export type SimilarIssue = z.infer<typeof SimilarIssueSchema>;

export const SimilarResponseSchema = z.object({
  results: z.array(SimilarIssueSchema).max(10),
  embedding_model: z.string().max(64),
  min_similarity: z.number(),
});
export type SimilarResponse = z.infer<typeof SimilarResponseSchema>;

export const ResolutionResponseSchema = z.object({
  result: z.object({
    has_relevant_history: z.boolean(),
    summary: z.string().min(1).max(500),
    steps: z.array(z.string().min(1).max(300)).max(6),
    cited_tickets: z.array(TicketNumber).max(5),
    confidence: Level,
    manipulation_attempt: z.boolean(),
  }),
  sources: z.array(SimilarIssueSchema).max(10),
  // null when no similar issues were found and no LLM call was made
  meta: CallMetaSchema.nullable(),
});
export type ResolutionResponse = z.infer<typeof ResolutionResponseSchema>;

export const ResolutionFeedbackSchema = z.object({
  feedback: z.enum(["helpful", "not_helpful"]),
});
