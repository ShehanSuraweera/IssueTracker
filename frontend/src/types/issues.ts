export type IssueStatus = "new" | "in_progress" | "on_hold" | "resolved" | "closed" | "cancelled";
export type IssueType = "bug" | "feature_request" | "question" | "incident";
export type ImpactLevel = "low" | "medium" | "high";
export type UrgencyLevel = "low" | "medium" | "high";
export type PriorityLevel = "low" | "moderate" | "high" | "critical";

export interface IssueSummary {
  id: string;
  ticketNumber: string;
  productId: string;
  title: string;
  status: IssueStatus;
  type: IssueType;
  priority: PriorityLevel;
  impact: ImpactLevel;
  urgency: UrgencyLevel;
  createdBy: string;
  assignedTo: string | null;
  slaDeadline: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  product: { id: string; name: string; code: string };
  creator: { id: string; fullName: string; email: string };
  assignee: { id: string; fullName: string; email: string } | null;
  _count: { comments: number; attachments: number };
}

export interface Comment {
  id: string;
  issueId: string;
  userId: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
  user: { id: string; fullName: string; role: string };
}

export interface Activity {
  id: string;
  issueId: string;
  userId: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: { id: string; fullName: string };
}

export interface Attachment {
  id: string;
  issueId: string;
  s3Key: string;
  filename: string;
  mimeType: string;
  sizeBytes: string;
  uploadedBy: string;
  createdAt: string;
  uploader: { id: string; fullName: string };
}

export interface IssueDetail extends IssueSummary {
  description: string;
  comments: Comment[];
  activities: Activity[];
  attachments: Attachment[];
}

export interface IssueListResponse {
  data: IssueSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface IssueStats {
  summary: {
    totalOpen: number;
    critical: number;
    atSlaRisk: number;
    resolvedThisWeek: number;
  };
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byRegion: Record<string, number>;
}

export interface PresignUploadResult {
  uploadUrl: string;
  s3Key: string;
  expiresIn: number;
}

export interface CreateIssueInput {
  productId: string;
  title: string;
  description: string;
  type: IssueType;
  impact?: ImpactLevel;
  urgency?: UrgencyLevel;
  slaDeadline?: string;
}

export interface UpdateIssueInput {
  title?: string;
  description?: string;
  type?: IssueType;
  status?: IssueStatus;
  impact?: ImpactLevel;
  urgency?: UrgencyLevel;
  slaDeadline?: string | null;
}

export interface ListIssuesQuery {
  search?: string;
  status?: IssueStatus;
  priority?: PriorityLevel;
  type?: IssueType;
  product_id?: string;
  assigned_to?: string;
  page?: number;
  limit?: number;
  sort?: "createdAt_desc" | "createdAt_asc" | "updatedAt_desc";
}
