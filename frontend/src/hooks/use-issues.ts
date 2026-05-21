import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { listIssues, getIssue, getStats, createIssue, updateIssue, addComment, resolveIssue, getFeed } from "@/api/issues";
import { queryKeys } from "./query-keys";
import type { ListIssuesQuery, UpdateIssueInput, FeedFilter } from "@/types/issues";

export function useIssues(query: ListIssuesQuery, search: string) {
  return useQuery({
    queryKey: queryKeys.issues.list(query, search),
    queryFn:  () => listIssues({ ...query, search: search || undefined }),
  });
}

export function useInfiniteIssues(
  query: Omit<ListIssuesQuery, "page" | "limit">,
  search: string,
) {
  return useInfiniteQuery({
    queryKey:         queryKeys.issues.infinite(query, search),
    queryFn:          ({ pageParam }) =>
      listIssues({ ...query, page: pageParam as number, limit: 30, search: search || undefined }),
    getNextPageParam: (last) =>
      last.pagination.page < last.pagination.totalPages
        ? last.pagination.page + 1
        : undefined,
    initialPageParam: 1,
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

export function useIssueStats() {
  return useQuery({
    queryKey: queryKeys.issues.stats(),
    queryFn:  getStats,
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
