import {
  IssueStatus,
  ImpactLevel,
  UrgencyLevel,
  PriorityLevel,
  UserRole,
  Prisma,
} from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/errorHandler";
import { createPresignedUploadUrl, createPresignedDownloadUrl, UPLOAD_EXPIRES_IN } from "../../lib/s3";
import { v4 as uuidv4 } from "uuid";
import type {
  CreateIssueInput,
  UpdateIssueInput,
  ListIssuesQuery,
  AssignIssueInput,
  ExportQuery,
  CreateCommentInput,
  PresignUploadInput,
  ConfirmAttachmentInput,
  FeedQuery,
} from "./issues.schemas";

// ─── ITIL Priority Matrix ─────────────────────────────────────────────────────

const PRIORITY_MATRIX: Record<ImpactLevel, Record<UrgencyLevel, PriorityLevel>> = {
  low:    { low: "low",      medium: "low",      high: "moderate" },
  medium: { low: "low",      medium: "moderate", high: "high"     },
  high:   { low: "moderate", medium: "high",     high: "critical" },
};

function computePriority(impact: ImpactLevel, urgency: UrgencyLevel): PriorityLevel {
  return PRIORITY_MATRIX[impact][urgency];
}

// ─── Status Transition Machine ────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  new:         ["in_progress", "cancelled"],
  in_progress: ["on_hold", "resolved", "cancelled"],
  on_hold:     ["in_progress", "cancelled"],
  resolved:    ["closed", "in_progress"],
  closed:      [],
  cancelled:   [],
};

function assertTransition(from: IssueStatus, to: IssueStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new AppError(
      422,
      "INVALID_STATUS_TRANSITION",
      `Cannot transition from '${from}' to '${to}'`
    );
  }
}

// ─── Auth user shape (mirrors req.user) ──────────────────────────────────────

interface AuthUser {
  id: bigint;
  email: string;
  role: UserRole;
  companyId: bigint | null;
}

// ─── Multi-tenant where clause ────────────────────────────────────────────────

function buildTenantWhere(user: AuthUser): Prisma.IssueWhereInput {
  if (user.role === "admin") return {};
  if (user.role === "engineer") {
    return { product: { userProductAccess: { some: { userId: user.id } } } };
  }
  return { product: { companyId: user.companyId ?? BigInt(-1) } };
}

// ─── Activity log helper ──────────────────────────────────────────────────────

async function writeActivity(
  tx: Prisma.TransactionClient,
  issueId: bigint,
  userId: bigint,
  changes: { field: string; oldValue?: string | null; newValue?: string | null }[]
): Promise<void> {
  if (changes.length === 0) return;
  await tx.issueActivity.createMany({
    data: changes.map((c) => ({
      issueId,
      userId,
      fieldName: c.field,
      oldValue: c.oldValue ?? null,
      newValue: c.newValue ?? null,
    })),
  });
}

// ─── Serializers ─────────────────────────────────────────────────────────────

function serializeIssue(issue: {
  id: bigint;
  productId: bigint;
  createdBy: bigint;
  assignedTo: bigint | null;
  sizeBytes?: bigint;
  [key: string]: unknown;
}) {
  return {
    ...issue,
    id: issue.id.toString(),
    productId: issue.productId.toString(),
    createdBy: issue.createdBy.toString(),
    assignedTo: issue.assignedTo?.toString() ?? null,
  };
}

function serializeUser(u: { id: bigint; [key: string]: unknown }) {
  return { ...u, id: u.id.toString() };
}

// ─── List Issues ──────────────────────────────────────────────────────────────

export async function listIssues(query: ListIssuesQuery, user: AuthUser) {
  const where: Prisma.IssueWhereInput = {
    ...buildTenantWhere(user),
    ...(query.status    && { status:    query.status    }),
    ...(query.priority  && { priority:  query.priority  }),
    ...(query.type      && { type:      query.type      }),
    ...(query.product_id  && { productId:  query.product_id  }),
    ...(query.assigned_to  && { assignedTo: query.assigned_to }),
    ...(query.unassigned   && { assignedTo: null }),
    ...(query.search && {
      OR: [
        { title:        { contains: query.search } },
        { description:  { contains: query.search } },
        { ticketNumber: { contains: query.search } },
      ],
    }),
  };

  const orderBy: Prisma.IssueOrderByWithRelationInput =
    query.sort === "createdAt_asc"  ? { createdAt: "asc" } :
    query.sort === "updatedAt_desc" ? { updatedAt: "desc" } :
                                      { createdAt: "desc" };

  const skip = (query.page - 1) * query.limit;

  const [issues, total] = await prisma.$transaction([
    prisma.issue.findMany({
      where,
      orderBy,
      skip,
      take: query.limit,
      include: {
        product: { select: { id: true, name: true, code: true } },
        creator: { select: { id: true, fullName: true, email: true } },
        assignee: { select: { id: true, fullName: true, email: true } },
        _count: { select: { comments: true, attachments: true } },
      },
    }),
    prisma.issue.count({ where }),
  ]);

  return {
    data: issues.map((i) => ({
      ...serializeIssue(i),
      product: serializeUser(i.product),
      creator: serializeUser(i.creator),
      assignee: i.assignee ? serializeUser(i.assignee) : null,
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

// ─── Create Issue ─────────────────────────────────────────────────────────────

export async function createIssue(input: CreateIssueInput, user: AuthUser) {
  const product = await prisma.products.findFirst({
    where: {
      id: input.productId,
      ...(user.role === "client_user" && { companyId: user.companyId ?? BigInt(-1) }),
      ...(user.role === "engineer"    && {
        userProductAccess: { some: { userId: user.id } },
      }),
    },
  });

  if (!product) {
    throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
  }

  const priority = computePriority(input.impact, input.urgency);

  const issue = await prisma.$transaction(async (tx) => {
    const count = await tx.issue.count({ where: { productId: input.productId } });
    const ticketNumber = `${product.code}-${String(count + 1).padStart(4, "0")}`;

    const created = await tx.issue.create({
      data: {
        productId:   input.productId,
        title:       input.title,
        description: input.description,
        type:        input.type,
        impact:      input.impact,
        urgency:     input.urgency,
        priority,
        createdBy:   user.id,
        ticketNumber,
        slaDeadline: input.slaDeadline ? new Date(input.slaDeadline) : null,
      },
      include: {
        product: { select: { id: true, name: true, code: true } },
        creator: { select: { id: true, fullName: true, email: true } },
      },
    });

    await tx.issueActivity.create({
      data: {
        issueId:   created.id,
        userId:    user.id,
        fieldName: "status",
        oldValue:  null,
        newValue:  "new",
      },
    });

    return created;
  });

  return {
    ...serializeIssue(issue),
    product: serializeUser(issue.product),
    creator: serializeUser(issue.creator),
    assignee: null,
  };
}

// ─── Get Issue (detail) ───────────────────────────────────────────────────────

export async function getIssue(issueId: bigint, user: AuthUser) {
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, ...buildTenantWhere(user) },
    include: {
      product: { select: { id: true, name: true, code: true } },
      creator: { select: { id: true, fullName: true, email: true } },
      assignee: { select: { id: true, fullName: true, email: true } },
      comments: {
        where: user.role === "client_user" ? { isInternal: false } : {},
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, fullName: true, role: true } } },
      },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { id: true, fullName: true } } },
      },
      attachments: {
        orderBy: { createdAt: "desc" },
        include: { uploader: { select: { id: true, fullName: true } } },
      },
    },
  });

  if (!issue) throw new AppError(404, "ISSUE_NOT_FOUND", "Issue not found");

  return {
    ...serializeIssue(issue),
    product: serializeUser(issue.product),
    creator: serializeUser(issue.creator),
    assignee: issue.assignee ? serializeUser(issue.assignee) : null,
    comments: issue.comments.map((c) => ({
      ...c,
      id:      c.id.toString(),
      issueId: c.issueId.toString(),
      userId:  c.userId.toString(),
      user:    serializeUser(c.user),
    })),
    activities: issue.activities.map((a) => ({
      ...a,
      id:      a.id.toString(),
      issueId: a.issueId.toString(),
      userId:  a.userId.toString(),
      user:    serializeUser(a.user),
    })),
    attachments: issue.attachments.map((att) => ({
      ...att,
      id:         att.id.toString(),
      issueId:    att.issueId.toString(),
      sizeBytes:  att.sizeBytes.toString(),
      uploadedBy: att.uploadedBy.toString(),
      uploader:   serializeUser(att.uploader),
    })),
  };
}

// ─── Update Issue ─────────────────────────────────────────────────────────────

export async function updateIssue(
  issueId: bigint,
  input: UpdateIssueInput,
  user: AuthUser
) {
  const existing = await prisma.issue.findFirst({
    where: { id: issueId, ...buildTenantWhere(user) },
  });

  if (!existing) throw new AppError(404, "ISSUE_NOT_FOUND", "Issue not found");

  if (user.role === "client_user" && existing.createdBy !== user.id) {
    throw new AppError(404, "ISSUE_NOT_FOUND", "Issue not found");
  }

  // Clients may close a resolved issue (their confirmation that the fix worked)
  const clientClosing =
    user.role === "client_user" &&
    input.status === "closed" &&
    existing.status === "resolved";

  // Soft-lock: clients cannot edit once an engineer has picked the issue up,
  // except to close a resolved issue
  if (user.role === "client_user" && existing.status !== "new" && !clientClosing) {
    throw new AppError(
      403,
      "ISSUE_LOCKED",
      "This issue is locked for editing once it has been picked up. Contact support to request changes."
    );
  }

  // Clients cannot change status except to close a resolved issue
  if (user.role === "client_user" && !clientClosing) {
    delete input.status;
  }

  if (input.status && input.status !== existing.status) {
    assertTransition(existing.status, input.status as IssueStatus);
  }

  const newImpact  = (input.impact  ?? existing.impact)  as ImpactLevel;
  const newUrgency = (input.urgency ?? existing.urgency) as UrgencyLevel;
  const newPriority = (input.impact || input.urgency)
    ? computePriority(newImpact, newUrgency)
    : existing.priority;

  const trunc = (s: string) => s.length > 120 ? s.slice(0, 120) + "…" : s;

  const changes: { field: string; oldValue?: string | null; newValue?: string | null }[] = [];
  if (input.title       && input.title       !== existing.title)       changes.push({ field: "title",       oldValue: existing.title,            newValue: input.title });
  if (input.type        && input.type        !== existing.type)        changes.push({ field: "type",        oldValue: existing.type,             newValue: input.type });
  if (input.status      && input.status      !== existing.status)      changes.push({ field: "status",      oldValue: existing.status,           newValue: input.status });
  if (newPriority       !== existing.priority)                         changes.push({ field: "priority",    oldValue: existing.priority,         newValue: newPriority });
  if (input.description && input.description !== existing.description) changes.push({ field: "description", oldValue: trunc(existing.description), newValue: trunc(input.description) });
  if (input.impact      && input.impact      !== existing.impact)      changes.push({ field: "impact",      oldValue: existing.impact,           newValue: input.impact });
  if (input.urgency     && input.urgency     !== existing.urgency)     changes.push({ field: "urgency",     oldValue: existing.urgency,          newValue: input.urgency });

  const resolvedAt =
    input.status === "resolved" && existing.status !== "resolved"
      ? new Date()
      : existing.resolvedAt;

  const closedAt =
    input.status === "closed" && existing.status !== "closed"
      ? new Date()
      : existing.closedAt;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.issue.update({
      where: { id: issueId },
      data: {
        ...(input.title       && { title:       input.title }),
        ...(input.description && { description: input.description }),
        ...(input.type        && { type:        input.type as any }),
        ...(input.status      && { status:      input.status as any }),
        ...(input.impact      && { impact:      input.impact as any }),
        ...(input.urgency     && { urgency:     input.urgency as any }),
        priority: newPriority,
        ...(input.slaDeadline !== undefined && {
          slaDeadline: input.slaDeadline ? new Date(input.slaDeadline) : null,
        }),
        resolvedAt,
        closedAt,
      },
      include: {
        product: { select: { id: true, name: true, code: true } },
        creator: { select: { id: true, fullName: true, email: true } },
        assignee: { select: { id: true, fullName: true, email: true } },
      },
    });

    await writeActivity(tx, issueId, user.id, changes);
    return result;
  });

  return {
    ...serializeIssue(updated),
    product: serializeUser(updated.product),
    creator: serializeUser(updated.creator),
    assignee: updated.assignee ? serializeUser(updated.assignee) : null,
  };
}

// ─── Delete Issue (soft) ──────────────────────────────────────────────────────

export async function deleteIssue(issueId: bigint, user: AuthUser) {
  const existing = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!existing) throw new AppError(404, "ISSUE_NOT_FOUND", "Issue not found");

  if (existing.status === "closed" || existing.status === "cancelled") {
    throw new AppError(409, "ISSUE_ALREADY_TERMINAL", "Issue is already closed or cancelled");
  }

  await prisma.$transaction(async (tx) => {
    await tx.issue.update({
      where: { id: issueId },
      data: { status: "cancelled", closedAt: new Date() },
    });
    await tx.issueActivity.create({
      data: {
        issueId,
        userId:    user.id,
        fieldName: "status",
        oldValue:  existing.status,
        newValue:  "cancelled",
      },
    });
  });
}

// ─── Assign Issue ─────────────────────────────────────────────────────────────

export async function assignIssue(
  issueId: bigint,
  input: AssignIssueInput,
  user: AuthUser
) {
  const existing = await prisma.issue.findUnique({
    where: { id: issueId },
    include: { assignee: { select: { fullName: true } } },
  });
  if (!existing) throw new AppError(404, "ISSUE_NOT_FOUND", "Issue not found");

  const assignee = await prisma.user.findUnique({ where: { id: input.assigneeId } });
  if (!assignee || assignee.role !== "engineer" || !assignee.isActive) {
    throw new AppError(422, "INVALID_ASSIGNEE", "Assignee must be an active engineer");
  }

  const oldAssigneeName = existing.assignee?.fullName ?? null;
  const isSelfAssign    = input.assigneeId === user.id;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.issue.update({
      where: { id: issueId },
      data: { assignedTo: input.assigneeId },
      include: {
        product: { select: { id: true, name: true, code: true } },
        creator: { select: { id: true, fullName: true, email: true } },
        assignee: { select: { id: true, fullName: true, email: true } },
      },
    });

    await writeActivity(tx, issueId, user.id, [
      {
        field:    isSelfAssign ? "selfAssigned" : "assignedTo",
        oldValue: isSelfAssign ? null : oldAssigneeName,
        newValue: assignee.fullName,
      },
    ]);

    return result;
  });

  return {
    ...serializeIssue(updated),
    product: serializeUser(updated.product),
    creator: serializeUser(updated.creator),
    assignee: updated.assignee ? serializeUser(updated.assignee) : null,
  };
}

// ─── Resolve Issue ────────────────────────────────────────────────────────────

export async function resolveIssue(issueId: bigint, user: AuthUser) {
  const existing = await prisma.issue.findFirst({
    where: { id: issueId, ...buildTenantWhere(user) },
  });
  if (!existing) throw new AppError(404, "ISSUE_NOT_FOUND", "Issue not found");

  assertTransition(existing.status, "resolved");

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.issue.update({
      where: { id: issueId },
      data: { status: "resolved", resolvedAt: new Date() },
      include: {
        product: { select: { id: true, name: true, code: true } },
        creator: { select: { id: true, fullName: true, email: true } },
        assignee: { select: { id: true, fullName: true, email: true } },
      },
    });

    await writeActivity(tx, issueId, user.id, [
      { field: "status", oldValue: existing.status, newValue: "resolved" },
    ]);

    return result;
  });

  // TODO: email issue creator stub

  return {
    ...serializeIssue(updated),
    product: serializeUser(updated.product),
    creator: serializeUser(updated.creator),
    assignee: updated.assignee ? serializeUser(updated.assignee) : null,
  };
}

// ─── Unified paginated feed ───────────────────────────────────────────────────

export async function getFeed(issueId: bigint, user: AuthUser, query: FeedQuery) {
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, ...buildTenantWhere(user) },
    select: { id: true },
  });
  if (!issue) throw new AppError(404, "ISSUE_NOT_FOUND", "Issue not found");

  const lt     = query.cursor ? { lt: new Date(query.cursor) } : undefined;
  const limit  = query.limit;
  const filter = query.filter;

  const [rawActs, rawCmts, rawAtts] = await Promise.all([
    filter !== "comments"
      ? prisma.issueActivity.findMany({
          where: { issueId, ...(lt && { createdAt: lt }) },
          orderBy: { createdAt: "desc" },
          take: limit,
          include: { user: { select: { id: true, fullName: true } } },
        })
      : ([] as any[]),
    filter !== "changes"
      ? prisma.issueComment.findMany({
          where: {
            issueId,
            ...(user.role === "client_user" && { isInternal: false }),
            ...(lt && { createdAt: lt }),
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          include: { user: { select: { id: true, fullName: true, role: true } } },
        })
      : ([] as any[]),
    filter !== "comments"
      ? prisma.issueAttachment.findMany({
          where: { issueId, ...(lt && { createdAt: lt }) },
          orderBy: { createdAt: "desc" },
          take: limit,
          include: { uploader: { select: { id: true, fullName: true } } },
        })
      : ([] as any[]),
  ]);

  // Merge, sort newest-first, take one extra to detect hasMore
  const merged: any[] = [
    ...rawActs.map((a: any) => ({ ...a, _kind: "activity" })),
    ...rawCmts.map((c: any) => ({ ...c, _kind: "comment" })),
    ...rawAtts.map((a: any) => ({ ...a, _kind: "attachment" })),
  ].sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime());

  const page      = merged.slice(0, limit);
  const hasMore   = merged.length > limit;
  const nextCursor = hasMore ? (page[page.length - 1].createdAt as Date).toISOString() : null;

  const data = page.map((item: any) => {
    const base = {
      id:        (item.id as bigint).toString(),
      createdAt: (item.createdAt as Date).toISOString(),
    };
    if (item._kind === "activity") {
      return {
        ...base,
        kind:      "activity" as const,
        user:      { id: item.user.id.toString(), fullName: item.user.fullName as string },
        fieldName: item.fieldName as string,
        oldValue:  item.oldValue as string | null,
        newValue:  item.newValue as string | null,
      };
    }
    if (item._kind === "comment") {
      return {
        ...base,
        kind:       "comment" as const,
        user:       { id: item.user.id.toString(), fullName: item.user.fullName as string, role: item.user.role as string },
        body:       item.body as string,
        isInternal: item.isInternal as boolean,
      };
    }
    return {
      ...base,
      kind:      "attachment" as const,
      user:      { id: item.uploader.id.toString(), fullName: item.uploader.fullName as string },
      filename:  item.filename as string,
      mimeType:  item.mimeType as string,
      sizeBytes: (item.sizeBytes as bigint).toString(),
    };
  });

  return { data, nextCursor, hasMore };
}

// ─── Stats (admin dashboard) ──────────────────────────────────────────────────

export async function getStats(user: AuthUser) {
  const now              = new Date();
  const weekAgo          = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const slaWarningCutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const openStatuses: IssueStatus[] = ["new", "in_progress", "on_hold"];

  const scope = buildTenantWhere(user);

  const [byStatus, byPriority, totalOpen, critical, atSlaRisk, resolvedThisWeek] =
    await prisma.$transaction([
      prisma.issue.groupBy({ by: ["status"],   where: scope, _count: { id: true } }),
      prisma.issue.groupBy({ by: ["priority"], where: scope, _count: { id: true } }),
      prisma.issue.count({ where: { ...scope, status: { in: openStatuses } } }),
      prisma.issue.count({ where: { ...scope, priority: "critical", status: { in: openStatuses } } }),
      prisma.issue.count({
        where: { ...scope, status: { in: openStatuses }, slaDeadline: { not: null, lte: slaWarningCutoff } },
      }),
      prisma.issue.count({
        where: { ...scope, status: "resolved", resolvedAt: { gte: weekAgo } },
      }),
    ]);

  const base = {
    summary: { totalOpen, critical, atSlaRisk, resolvedThisWeek },
    byStatus: byStatus.reduce<Record<string, number>>(
      (acc, s) => ({ ...acc, [s.status]: s._count.id }), {}
    ),
    byPriority: byPriority.reduce<Record<string, number>>(
      (acc, p) => ({ ...acc, [p.priority]: p._count.id }), {}
    ),
  };

  if (user.role === "engineer") {
    const [mineOpen, mineCritical, mineAtRisk, mineResolved, mineResolvedAll, unassignedOpen, unassignedCritical] =
      await prisma.$transaction([
        prisma.issue.count({ where: { ...scope, assignedTo: user.id, status: { in: openStatuses } } }),
        prisma.issue.count({ where: { ...scope, assignedTo: user.id, priority: "critical", status: { in: openStatuses } } }),
        prisma.issue.count({ where: { ...scope, assignedTo: user.id, status: { in: openStatuses }, slaDeadline: { not: null, lte: slaWarningCutoff } } }),
        prisma.issue.count({ where: { ...scope, assignedTo: user.id, status: "resolved", resolvedAt: { gte: weekAgo } } }),
        prisma.issue.count({ where: { ...scope, assignedTo: user.id, status: "resolved" } }),
        prisma.issue.count({ where: { ...scope, assignedTo: null, status: { in: openStatuses } } }),
        prisma.issue.count({ where: { ...scope, assignedTo: null, priority: "critical", status: { in: openStatuses } } }),
      ]);
    return {
      ...base,
      engineerView: {
        mine:       { open: mineOpen, critical: mineCritical, atSlaRisk: mineAtRisk, resolvedThisWeek: mineResolved, resolvedAll: mineResolvedAll },
        unassigned: { open: unassignedOpen, critical: unassignedCritical },
      },
    };
  }

  if (user.role !== "admin") return base;

  type RegionRow = { region: string; count: bigint };
  const [byRegionRaw, unassignedOpen] = await Promise.all([
    prisma.$queryRaw<RegionRow[]>`
      SELECT c.region, COUNT(i.id) AS count
      FROM issues i
      JOIN products p ON p.id = i.product_id
      JOIN companies c ON c.id = p.company_id
      GROUP BY c.region
    `,
    prisma.issue.count({ where: { ...scope, assignedTo: null, status: { in: openStatuses } } }),
  ]);

  return {
    ...base,
    adminView: { unassignedOpen },
    byRegion: byRegionRaw.reduce<Record<string, number>>(
      (acc, r) => ({ ...acc, [r.region]: Number(r.count) }), {}
    ),
  };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function exportIssues(query: ExportQuery) {
  const where: Prisma.IssueWhereInput = {
    ...(query.status     && { status:    query.status }),
    ...(query.product_id && { productId: query.product_id }),
  };

  const issues = await prisma.issue.findMany({
    where,
    take: 1000,
    orderBy: { createdAt: "desc" },
    include: {
      product: { select: { name: true, code: true } },
      creator: { select: { fullName: true, email: true } },
      assignee: { select: { fullName: true, email: true } },
    },
  });

  const rows = issues.map((i) => ({
    id:            i.id.toString(),
    ticketNumber:  i.ticketNumber,
    product:       i.product.name,
    productCode:   i.product.code,
    title:         i.title,
    status:        i.status,
    type:          i.type,
    priority:      i.priority,
    impact:        i.impact,
    urgency:       i.urgency,
    createdBy:     i.creator.fullName,
    createdByEmail: i.creator.email,
    assignedTo:    i.assignee?.fullName ?? "",
    slaDeadline:   i.slaDeadline?.toISOString() ?? "",
    resolvedAt:    i.resolvedAt?.toISOString() ?? "",
    closedAt:      i.closedAt?.toISOString() ?? "",
    createdAt:     i.createdAt.toISOString(),
    updatedAt:     i.updatedAt.toISOString(),
  }));

  if (query.format === "csv") {
    return { format: "csv" as const, content: toCsv(rows), count: rows.length };
  }
  return { format: "json" as const, content: rows, count: rows.length };
}

// ─── Add Comment ──────────────────────────────────────────────────────────────

export async function addComment(
  issueId: bigint,
  input: CreateCommentInput,
  user: AuthUser
) {
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, ...buildTenantWhere(user) },
  });
  if (!issue) throw new AppError(404, "ISSUE_NOT_FOUND", "Issue not found");

  if (input.isInternal && user.role === "client_user") {
    throw new AppError(403, "FORBIDDEN", "Clients cannot post internal comments");
  }

  const comment = await prisma.issueComment.create({
    data: {
      issueId,
      userId: user.id,
      body: input.body,
      isInternal: input.isInternal,
    },
    include: { user: { select: { id: true, fullName: true, role: true } } },
  });

  return {
    ...comment,
    id: comment.id.toString(),
    issueId: comment.issueId.toString(),
    userId: comment.userId.toString(),
    user: serializeUser(comment.user),
  };
}

// ─── Presign Upload URL ───────────────────────────────────────────────────────

export async function presignUpload(
  issueId: bigint,
  input: PresignUploadInput,
  user: AuthUser
) {
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, ...buildTenantWhere(user) },
  });
  if (!issue) throw new AppError(404, "ISSUE_NOT_FOUND", "Issue not found");

  const s3Key = `issues/${issueId}/${uuidv4()}/${input.filename}`;
  const uploadUrl = await createPresignedUploadUrl(s3Key, input.mimeType, input.sizeBytes);

  return { uploadUrl, s3Key, expiresIn: UPLOAD_EXPIRES_IN };
}

// ─── Confirm Attachment ───────────────────────────────────────────────────────

export async function confirmAttachment(
  issueId: bigint,
  input: ConfirmAttachmentInput,
  user: AuthUser
) {
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, ...buildTenantWhere(user) },
  });
  if (!issue) throw new AppError(404, "ISSUE_NOT_FOUND", "Issue not found");

  const attachment = await prisma.issueAttachment.create({
    data: {
      issueId,
      s3Key: input.s3Key,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: BigInt(input.sizeBytes),
      uploadedBy: user.id,
    },
    include: { uploader: { select: { id: true, fullName: true } } },
  });

  return {
    ...attachment,
    id: attachment.id.toString(),
    issueId: attachment.issueId.toString(),
    sizeBytes: attachment.sizeBytes.toString(),
    uploadedBy: attachment.uploadedBy.toString(),
    uploader: serializeUser(attachment.uploader),
  };
}

// ─── Get Download URL ─────────────────────────────────────────────────────────

export async function getDownloadUrl(
  issueId: bigint,
  attachmentId: bigint,
  user: AuthUser
) {
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, ...buildTenantWhere(user) },
  });
  if (!issue) throw new AppError(404, "ISSUE_NOT_FOUND", "Issue not found");

  const attachment = await prisma.issueAttachment.findFirst({
    where: { id: attachmentId, issueId },
  });
  if (!attachment) throw new AppError(404, "ATTACHMENT_NOT_FOUND", "Attachment not found");

  const downloadUrl = await createPresignedDownloadUrl(attachment.s3Key);

  return {
    id: attachment.id.toString(),
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes.toString(),
    downloadUrl,
  };
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsv(rows: Record<string, string>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(",")),
  ].join("\n");
}
