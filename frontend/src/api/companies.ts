import { api } from "./client";
import type { Company, CompanyDetail, CreateCompanyInput, UpdateCompanyInput } from "@/types/companies";

export async function listCompanies(): Promise<Company[]> {
  const { data } = await api.get<{ data: Company[] }>("/companies");
  return data.data;
}

export async function getCompany(id: string): Promise<CompanyDetail> {
  const { data } = await api.get<{ data: CompanyDetail }>(`/companies/${id}`);
  return data.data;
}

export async function createCompany(input: CreateCompanyInput): Promise<Company> {
  const { data } = await api.post<{ data: Company }>("/companies", input);
  return data.data;
}

export async function updateCompany(id: string, input: UpdateCompanyInput): Promise<Company> {
  const { data } = await api.patch<{ data: Company }>(`/companies/${id}`, input);
  return data.data;
}
