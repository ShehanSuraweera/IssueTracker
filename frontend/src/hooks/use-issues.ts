import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { listIssues, getIssue, getStats, createIssue, updateIssue, addComment, resolveIssue, getFeed, assignIssue, listSavedViews, createSavedView, renameSavedView, deleteSavedView, presignUpload, confirmAttachment } from "@/api/issues";
import { queryKeys } from "./query-keys";
import type { ListIssuesQuery, UpdateIssueInput, FeedFilter } from "@/types/issues";

export function useIssues(
  query: ListIssuesQuery,
  search: string,
  options?: { refetchInterval?: number },
) {
  return useQuery({
    queryKey:        queryKeys.issues.list(query, search),
    queryFn:         () => listIssues({ ...query, search: search || undefined }),
    refetchInterval: options?.refetchInterval,
  });
}

export function useInfiniteIssues(
  query: Omit<ListIssuesQuery, "page" | "limit">,
  search: string,
  options?: { refetchInterval?: number },
) {
  return useInfiniteQuery({
    queryKey:         queryKeys.issues.infinite(query, search),
    queryFn:          ({ pageParam }) =>
      listIssues({ ...query, page: pageParam as number, limit: 15, search: search || undefined }),
    getNextPageParam: (last) =>
      last.pagination.page < last.pagination.totalPages
        ? last.pagination.page + 1
        : undefined,
    initialPageParam: 1,
    refetchInterval:  options?.refetchInterval,
  });
}

export function useFeed(issueId: string | undefined, filter: FeedFilter) {
  return useInfiniteQuery({
    queryKey:         queryKeys.issues.feed(issueId, filter),
    queryFn:          ({ pageParam }) =>
      getFeed(issueId!, pageParam as string | null, filter),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    enabled:          !!issueId,
  });
}

export function useIssue(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.issues.detail(id),
    queryFn:  () => getIssue(id!),
    enabled:  !!id,
  });
}

export function useIssueStats(options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey:        queryKeys.issues.stats(),
    queryFn:         getStats,
    refetchInterval: options?.refetchInterval,
  });
}

export function useCreateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createIssue,
    onSuccess:  () => qc.invalidateQueries({ queryKey: queryKeys.issues.all() }),
  });
}

export function useUpdateIssue(issueId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateIssueInput) => updateIssue(issueId!, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) });
      qc.invalidateQueries({ queryKey: queryKeys.issues.all() });
    },
  });
}

export function useAddComment(issueId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, isInternal }: { body: string; isInternal: boolean }) =>
      addComment(issueId!, body, isInternal),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) });
      qc.resetQueries({ queryKey: queryKeys.issues.feed(issueId, "all") });
      qc.resetQueries({ queryKey: queryKeys.issues.feed(issueId, "comments") });
    },
  });
}

export function useResolveIssue(issueId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => resolveIssue(issueId!),
    onSuccess:  () => qc.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) }),
  });
}

export function useAssignIssue(issueId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assigneeId: string) => assignIssue(issueId!, assigneeId),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) });
      qc.invalidateQueries({ queryKey: queryKeys.issues.stats() });
    },
  });
}

export function useSavedViews() {
  return useQuery({
    queryKey: queryKeys.savedViews.all(),
    queryFn:  listSavedViews,
  });
}

export function useCreateSavedView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, query }: { name: string; query: Omit<ListIssuesQuery, "page" | "limit"> }) =>
      createSavedView(name, query),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.savedViews.all() }),
  });
}

export function useRenameSavedView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameSavedView(id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.savedViews.all() }),
  });
}

export function useDeleteSavedView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSavedView(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: queryKeys.savedViews.all() }),
  });
}

export function useUploadAttachments(issueId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        const mime = file.type || "application/octet-stream";
        const { uploadUrl, s3Key } = await presignUpload(issueId!, file.name, mime, file.size);
        await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": mime } });
        await confirmAttachment(issueId!, { s3Key, filename: file.name, mimeType: mime, sizeBytes: file.size });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) });
      qc.resetQueries({ queryKey: queryKeys.issues.feed(issueId, "all") });
      qc.resetQueries({ queryKey: queryKeys.issues.feed(issueId, "comments") });
      qc.resetQueries({ queryKey: queryKeys.issues.feed(issueId, "changes") });
    },
  });
}
