import { useQuery } from "@tanstack/react-query";
import { listCompanies, getCompany } from "@/api/companies";
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
