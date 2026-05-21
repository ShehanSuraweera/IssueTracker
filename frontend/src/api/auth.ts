import { api, setTokens, clearTokens } from "./client";
import type { AuthResponse, UserProfile } from "@/types/auth";

export async function login(email: string, password: string): Promise<AuthResponse> {
  const { data } = await api.post<{ data: AuthResponse }>("/auth/login", { email, password });
  setTokens(data.data.accessToken, data.data.refreshToken);
  return data.data;
}

export async function logout(refreshToken?: string): Promise<void> {
  try {
    await api.post("/auth/logout", { refreshToken });
  } finally {
    clearTokens();
  }
}

export async function getMe(): Promise<UserProfile> {
  const { data } = await api.get<{ data: UserProfile }>("/auth/me");
  return data.data;
}
