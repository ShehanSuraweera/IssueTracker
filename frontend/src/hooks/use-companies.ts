import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listCompanies, getCompany, createCompany } from "@/api/companies";
import { queryKeys } from "./query-keys";

export function useCompanies() {
  return useQuery({
    queryKey: queryKeys.companies.all(),
    queryFn:  listCompanies,
  });
}

export function useCompany(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.companies.detail(id),
    queryFn:  () => getCompany(id!),
    enabled:  !!id,
  });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCompany,
    onSuccess:  () => qc.invalidateQueries({ queryKey: queryKeys.companies.all() }),
  });
}
