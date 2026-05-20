import { z } from "zod";

const bigIntParam = z
  .string()
  .regex(/^\d+$/, "Must be a numeric ID")
  .transform((s) => BigInt(s));

// ─── Enum literals (mirrors schema.prisma) ───────────────────────────────────

const IssueStatusEnum = z.enum([
  "new",
  "in_progress",
  "on_hold",
  "resolved",
  "closed",
  "cancelled",
]);

const IssueTypeEnum = z.enum([
  "bug",
  "feature_request",
  "question",
  "incident",
]);

const ImpactLevelEnum = z.enum(["low", "medium", "high"]);
const UrgencyLevelEnum = z.enum(["low", "medium", "high"]);
const PriorityLevelEnum = z.enum(["low", "moderate", "high", "critical"]);

// ─── Request schemas ─────────────────────────────────────────────────────────

export const CreateIssueSchema = z.object({
  productId: bigIntParam,
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().min(1, "Description is required"),
  type: IssueTypeEnum,
  impact: ImpactLevelEnum.default("medium"),
  urgency: UrgencyLevelEnum.default("medium"),
  slaDeadline: z.string().datetime().optional(),
});

export const UpdateIssueSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().min(1).optional(),
    type: IssueTypeEnum.optional(),
    status: IssueStatusEnum.optional(),
    impact: ImpactLevelEnum.optional(),
    urgency: UrgencyLevelEnum.optional(),
    slaDeadline: z.string().datetime().nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided",
  });

export const ListIssuesQuerySchema = z.object({
  search: z.string().optional(),
  status: IssueStatusEnum.optional(),
  priority: PriorityLevelEnum.optional(),
  type: IssueTypeEnum.optional(),
  product_id: bigIntParam.optional(),
  assigned_to: bigIntParam.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z
    .enum(["createdAt_desc", "createdAt_asc", "updatedAt_desc"])
    .default("createdAt_desc"),
});

export const AssignIssueSchema = z.object({
  assigneeId: bigIntParam,
});

export const ExportQuerySchema = z.object({
  format: z.enum(["csv", "json"]).default("json"),
  status: IssueStatusEnum.optional(),
  product_id: bigIntParam.optional(),
});

// ─── Inferred types ──────────────────────────────────────────────────────────

export type CreateIssueInput = z.infer<typeof CreateIssueSchema>;
export type UpdateIssueInput = z.infer<typeof UpdateIssueSchema>;
export type ListIssuesQuery = z.infer<typeof ListIssuesQuerySchema>;
export type AssignIssueInput = z.infer<typeof AssignIssueSchema>;
export type ExportQuery = z.infer<typeof ExportQuerySchema>;
