export type Region = "KR" | "LK" | "IN" | "GLOBAL";

export interface Company {
  id: string;
  name: string;
  contactEmail: string;
  region: Region;
  createdAt: string;
  _count?: { products: number; users: number };
}

export interface CompanyProduct {
  id: string;
  companyId: string;
  name: string;
  code: string;
  owningOffice: string;
  description: string | null;
  createdAt: string;
  _count: { issues: number };
}

export interface CompanyDetail extends Company {
  products: CompanyProduct[];
}

export interface CreateCompanyInput {
  name: string;
  contactEmail: string;
  region: Region;
}

export interface UpdateCompanyInput {
  name?: string;
  contactEmail?: string;
  region?: Region;
}
