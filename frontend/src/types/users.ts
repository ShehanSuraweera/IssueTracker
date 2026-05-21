export type UserRole = "client_user" | "engineer" | "admin";
export type Office = "KR" | "LK" | "IN";

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  companyId: string | null;
  office: Office | null;
  isActive: boolean;
  createdAt: string;
  company?: { id: string; name: string } | null;
}

export interface UserDetail extends User {
  company: { id: string; name: string; region: string } | null;
  productAccess: Array<{ id: string; name: string; code: string; companyId: string }>;
}

export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  companyId?: string;
  office?: Office;
}

export interface UpdateUserInput {
  email?: string;
  fullName?: string;
  role?: UserRole;
  companyId?: string | null;
  office?: Office | null;
  isActive?: boolean;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}
