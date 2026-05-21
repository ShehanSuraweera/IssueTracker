import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listIssues, getIssue, getStats, createIssue, updateIssue, addComment, resolveIssue } from "@/api/issues";
import { queryKeys } from "./query-keys";
import type { ListIssuesQuery, UpdateIssueInput } from "@/types/issues";

export function useIssues(query: ListIssuesQuery, search: string) {
  return useQuery({
    queryKey: queryKeys.issues.list(query, search),
    queryFn:  () => listIssues({ ...query, search: search || undefined }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) }),
  });
}

export function useResolveIssue(issueId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => resolveIssue(issueId!),
    onSuccess:  () => qc.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) }),
  });
}
