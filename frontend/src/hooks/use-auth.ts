import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth.store";
import { clearTokens } from "@/api/client";
import * as AuthApi from "@/api/auth";
import { queryClient } from "@/lib/query-client";
import type { UserRole } from "@/types/auth";

export function useAuth() {
  const { user, isAuthenticated, setUser, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  async function login(email: string, password: string) {
    const result = await AuthApi.login(email, password);
    setUser(result.user);
    return result;
  }

  async function logout() {
    const refreshToken = localStorage.getItem("refresh_token") ?? undefined;
    await AuthApi.logout(refreshToken).catch(() => {});
    clearTokens();
    clearAuth();
    queryClient.clear();
    navigate("/login");
  }

  function hasRole(...roles: UserRole[]): boolean {
    return !!user && roles.includes(user.role);
  }

  return { user, isAuthenticated, login, logout, hasRole };
}
