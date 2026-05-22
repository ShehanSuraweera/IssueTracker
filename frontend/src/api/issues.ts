import { api } from "./client";
import type {
  IssueDetail,
  IssueListResponse,
  CreateIssueInput,
  UpdateIssueInput,
  ListIssuesQuery,
  IssueStats,
  Comment,
  Attachment,
  PresignUploadResult,
  FeedResponse,
  FeedFilter,
} from "@/types/issues";

export async function listIssues(query: ListIssuesQuery): Promise<IssueListResponse> {
  const { data } = await api.get<IssueListResponse>("/issues", { params: query });
  return data;
}

export async function getIssue(id: string): Promise<IssueDetail> {
  const { data } = await api.get<{ data: IssueDetail }>(`/issues/${id}`);
  return data.data;
}

export async function createIssue(input: CreateIssueInput): Promise<IssueDetail> {
  const { data } = await api.post<{ data: IssueDetail }>("/issues", input);
  return data.data;
}

export async function updateIssue(id: string, input: UpdateIssueInput): Promise<IssueDetail> {
  const { data } = await api.patch<{ data: IssueDetail }>(`/issues/${id}`, input);
  return data.data;
}

export async function deleteIssue(id: string): Promise<void> {
  await api.delete(`/issues/${id}`);
}

export async function assignIssue(id: string, assigneeId: string): Promise<IssueDetail> {
  const { data } = await api.post<{ data: IssueDetail }>(`/issues/${id}/assign`, { assigneeId });
  return data.data;
}

export async function resolveIssue(id: string): Promise<IssueDetail> {
  const { data } = await api.post<{ data: IssueDetail }>(`/issues/${id}/resolve`);
  return data.data;
}

export async function getStats(): Promise<IssueStats> {
  const { data } = await api.get<{ data: IssueStats }>("/issues/stats");
  return data.data;
}

export async function addComment(
  issueId: string,
  body: string,
  isInternal = false
): Promise<Comment> {
  const { data } = await api.post<{ data: Comment }>(`/issues/${issueId}/comments`, {
    body,
    isInternal,
  });
  return data.data;
}

export async function presignUpload(
  issueId: string,
  filename: string,
  mimeType: string,
  sizeBytes: number
): Promise<PresignUploadResult> {
  const { data } = await api.post<{ data: PresignUploadResult }>(
    `/issues/${issueId}/attachments/presign`,
    { filename, mimeType, sizeBytes }
  );
  return data.data;
}

export async function confirmAttachment(
  issueId: string,
  payload: { s3Key: string; filename: string; mimeType: string; sizeBytes: number }
): Promise<Attachment> {
  const { data } = await api.post<{ data: Attachment }>(`/issues/${issueId}/attachments`, payload);
  return data.data;
}

export async function getFeed(
  issueId: string,
  cursor: string | null,
  filter: FeedFilter = "all"
): Promise<FeedResponse> {
  const params: Record<string, string> = { filter };
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<FeedResponse>(`/issues/${issueId}/feed`, { params });
  return data;
}

export async function exportIssues(
  format: "csv" | "json",
  params: { status?: string; product_id?: string } = {}
): Promise<{ blob: Blob; filename: string }> {
  const response = await api.get("/issues/export", {
    params:       { format, ...params },
    responseType: "blob",
  });
  const ext      = format === "csv" ? "csv" : "json";
  const filename = `issues-export.${ext}`;
  return { blob: response.data as Blob, filename };
}

export async function getDownloadUrl(
  issueId: string,
  attId: string
): Promise<{ downloadUrl: string; filename: string }> {
  const { data } = await api.get<{
    data: { downloadUrl: string; filename: string; mimeType: string; sizeBytes: string };
  }>(`/issues/${issueId}/attachments/${attId}/download`);
  return data.data;
}
