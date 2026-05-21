export type UserRole = "client_user" | "engineer" | "admin";
export type Office = "KR" | "LK" | "IN";

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  companyId: string | null;
  office: Office | null;
  isActive: boolean;
  createdAt: string;
  company?: { id: string; name: string; region: string } | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: UserProfile;
}
