export type Office = "KR" | "LK" | "IN";

export interface Product {
  id: string;
  companyId: string;
  name: string;
  code: string;
  owningOffice: Office;
  description: string | null;
  createdAt: string;
  company: { id: string; name: string; region: string };
  _count?: { issues: number };
}

export interface CreateProductInput {
  companyId: string;
  name: string;
  code: string;
  owningOffice: Office;
  description?: string;
}

export interface UpdateProductInput {
  name?: string;
  owningOffice?: Office;
  description?: string | null;
}
