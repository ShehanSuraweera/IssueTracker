import axios, { type InternalAxiosRequestConfig } from "axios";

const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: false,
});

// ─── Request interceptor: attach access token ─────────────────────────────────

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response interceptor: silent token refresh on 401 ───────────────────────

let isRefreshing = false;
let waitQueue: Array<(token: string) => void> = [];

function drainQueue(token: string) {
  waitQueue.forEach((cb) => cb(token));
  waitQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    const url = original.url ?? "";
    const isAuthEndpoint = url.includes("/auth/login") || url.includes("/auth/refresh");

    if (error.response?.status !== 401 || original._retry || isAuthEndpoint) {
      return Promise.reject(error);
    }

    const refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) {
      clearTokens();
      window.location.href = "/login";
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve) => {
        waitQueue.push(resolve);
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
      const { accessToken, refreshToken: newRefresh } = data.data;

      localStorage.setItem("access_token", accessToken);
      localStorage.setItem("refresh_token", newRefresh);

      api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
      drainQueue(accessToken);

      original.headers.Authorization = `Bearer ${accessToken}`;
      return api(original);
    } catch {
      clearTokens();
      window.location.href = "/login";
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  }
);

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem("access_token", accessToken);
  localStorage.setItem("refresh_token", refreshToken);
}

export function clearTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}
