import type { ListIssuesQuery } from "@/types/issues";

export const queryKeys = {
  issues: {
    all:      () => ["issues"] as const,
    list:     (q: ListIssuesQuery, search: string) => ["issues", "list", q, search] as const,
    infinite: (q: Omit<ListIssuesQuery, "page" | "limit">, search: string) => ["issues", "infinite", q, search] as const,
    detail:   (id: string | undefined) => ["issues", id] as const,
    feed:     (id: string | undefined, filter: string) => ["issues", id, "feed", filter] as const,
    stats:    () => ["issues", "stats"] as const,
  },
  companies: {
    all: () => ["companies"] as const,
    detail: (id: string | undefined) => ["companies", id] as const,
  },
  users: {
    all: () => ["users"] as const,
    detail: (id: string | undefined) => ["users", id] as const,
  },
  products: {
    all: () => ["products"] as const,
  },
};
