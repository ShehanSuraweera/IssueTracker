import { useNavigate } from "react-router-dom";
import { RefreshCw, Plus } from "lucide-react";
import { useIssues, useIssueStats } from "@/hooks/use-issues";
import { useAuth } from "@/hooks/use-auth";
import { useTabsStore } from "@/store/tabs.store";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import heroImg from "@/assets/hero.png";
import type { IssueSummary } from "@/types/issues";
import { StatusBadge } from "@/components/ui/status-badge";
import { PriorityBadge } from "@/components/ui/priority-badge";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slaInfo(deadline: string | null): { label: string; breached: boolean } {
  if (!deadline) return { label: "—", breached: false };
  const rem = new Date(deadline).getTime() - Date.now();
  if (rem <= 0) return { label: "Breached", breached: true };
  const d = Math.floor(rem / 86_400_000);
  const h = Math.floor((rem % 86_400_000) / 3_600_000);
  return { label: d > 0 ? `${d}d ${h}h` : `${h}h`, breached: false };
}

function relativeTime(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
}

// ─── KPI Tile ─────────────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  accent = "default",
  onClick,
}: {
  label: string;
  value: number | undefined;
  accent?: "red" | "orange" | "default";
  onClick?: () => void;
}) {
  const numClass =
    accent === "red"    ? "text-red-600" :
    accent === "orange" ? "text-orange-500" :
    "text-foreground";

  return (
    <Card
      onClick={onClick}
      className={onClick ? "cursor-pointer hover:border-primary/40 hover:shadow-md transition-all" : ""}
    >
      <CardContent className="p-5">
        <p className="text-xs text-muted-foreground font-medium mb-5">{label}</p>
        {value === undefined ? (
          <Skeleton className="h-10 w-14" />
        ) : (
          <p className={`text-5xl font-light tracking-tight ${numClass}`}>{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Engineer Swimlanes ───────────────────────────────────────────────────────

function EngineerStats({ stats }: { stats: ReturnType<typeof useIssueStats>["data"] }) {
  const navigate = useNavigate();
  const ev = stats?.engineerView;

  const tiles: {
    label: string;
    value: number | undefined;
    accent?: "red" | "orange" | "default";
    navViewId?: string;
    nav?: boolean;
  }[] = [
    { label: "My Open",            value: ev?.mine.open,             navViewId: "my_assigned" },
    { label: "My Critical",        value: ev?.mine.critical,         accent: "red",    navViewId: "my_critical" },
    { label: "Pending Breach",     value: ev?.mine.atSlaRisk,        accent: "orange" },
    { label: "Resolved This Week", value: ev?.mine.resolvedThisWeek },
    { label: "Unassigned",         value: ev?.unassigned.open,       navViewId: "unassigned" },
    { label: "All Resolved",       value: ev?.mine.resolvedAll },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map(({ label, value, accent = "default", navViewId, nav }) => (
        <KpiTile
          key={label}
          label={label}
          value={value}
          accent={accent}
          onClick={
            navViewId ? () => navigate("/issues", { state: { viewId: navViewId } }) :
            nav       ? () => navigate("/issues") :
            undefined
          }
        />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const { openTab } = useTabsStore();

  const { data: stats } = useIssueStats();

  const workQuery = hasRole("engineer") && user
    ? { assigned_to: user.id, limit: 15, sort: "updatedAt_desc" as const }
    : { limit: 15, sort: "updatedAt_desc" as const };

  const { data: myWork, dataUpdatedAt } = useIssues(workQuery, "");

  const openIssue = (issue: IssueSummary) => {
    openTab({
      id:    `issue:${issue.id}`,
      label: issue.ticketNumber,
      path:  `/issues/${issue.id}`,
      meta:  { title: issue.title, status: issue.status, priority: issue.priority },
    });
    navigate(`/issues/${issue.id}`);
  };

  const firstName = user?.fullName?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-7">
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-xl border bg-linear-to-br from-primary/5 to-muted/20">
        {/* Ripple rings */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: 0.045,
            backgroundImage:
              "repeating-radial-gradient(circle at 68% 50%, #082A9C 0, #082A9C 1px, transparent 0, transparent 48px)",
          }}
        />
        <div className="relative flex items-center justify-between px-8 py-7">
          <div>
            <h1 className="text-2xl font-semibold">Hello, {firstName}!</h1>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-sm leading-relaxed">
              Get a little help monitoring your work with your personal home page.
            </p>
          </div>
          <img
            src={heroImg}
            alt=""
            className="h-28 w-auto opacity-90 select-none pointer-events-none hidden sm:block"
          />
        </div>
      </div>

      {/* ── Important items ───────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold">Important items</h2>
        <p className="text-xs text-muted-foreground mt-0.5 mb-3">
          Check these metrics to see the most important items to work on.
        </p>
        {hasRole("engineer") ? (
          <EngineerStats stats={stats} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <KpiTile
              label={hasRole("admin") ? "All Unassigned" : "Open"}
              value={hasRole("admin") ? stats?.adminView?.unassignedOpen : myWork?.pagination.total}
              onClick={() => navigate("/issues", { state: { viewId: "unassigned" } })}
            />
            <KpiTile
              label="Critical"
              value={stats?.summary.critical}
              accent="red"
              onClick={() => navigate("/issues", { state: { viewId: "p_critical" } })}
            />
            <KpiTile
              label="SLA At Risk"
              value={stats?.summary.atSlaRisk}
              accent="orange"
            />
            <KpiTile
              label="Resolved This Week"
              value={stats?.summary.resolvedThisWeek}
            />
            <KpiTile
              label="Total Open"
              value={stats?.summary.totalOpen}
            />
          </div>
        )}
      </div>

      {/* ── My Work ───────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">
              {user?.role === "client_user" ? "My Issues" : user?.role === "admin" ? "All Work" : "My Work"}
            </h2>
            {myWork && (
              <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                {myWork.pagination.total > 99 ? "99+" : myWork.pagination.total}
              </span>
            )}
          </div>
          {dataUpdatedAt > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <RefreshCw className="size-3" />
              Last refreshed {relativeTime(dataUpdatedAt)}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          {user?.role === "client_user"
            ? "Track the issues you've submitted and follow up on their progress."
            : user?.role === "admin"
            ? "Overview of all active issues across the workspace."
            : "Track your active tasks and stay on top of your queue."}
        </p>

        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                {["Ticket", "Title", "Priority", "State", "Product", "Actual time left", "Has breached", "Created", "Updated"].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!myWork ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-3 py-2.5">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : myWork.data.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    No active work items.
                  </td>
                </tr>
              ) : (
                myWork.data.map((issue) => {
                  const sla = slaInfo(issue.slaDeadline);
                  return (
                    <tr
                      key={issue.id}
                      onClick={() => openIssue(issue)}
                      className="border-b last:border-0 cursor-pointer hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="font-mono text-xs text-muted-foreground">{issue.ticketNumber}</span>
                      </td>
                      <td className="px-3 py-2.5 max-w-55">
                        <span className="font-medium truncate block">{issue.title}</span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <PriorityBadge priority={issue.priority} />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <StatusBadge status={issue.status} />
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {issue.product.name}
                      </td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                        <span className={sla.breached ? "text-red-600 font-medium" : "text-muted-foreground"}>
                          {sla.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                        {sla.breached ? (
                          <span className="text-red-600 font-medium">Yes</span>
                        ) : (
                          <span className="text-muted-foreground">No</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(issue.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(issue.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── FAB: New Task (client only) ───────────────────────────────── */}
      {hasRole("client_user") && (
        <button
          onClick={() => navigate("/issues/new")}
          title="New task"
          className="fixed bottom-6 right-6 z-50 flex items-center justify-center size-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 hover:shadow-xl active:scale-95 transition-all"
        >
          <Plus className="size-6" />
        </button>
      )}
    </div>
  );
}
