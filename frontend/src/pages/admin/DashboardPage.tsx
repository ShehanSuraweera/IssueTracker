import { Info, RefreshCw } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { useIssueStats } from "@/hooks/use-issues";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip as UITooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { DashboardCharts } from "@/components/ui/dashboard-charts";
import { relativeTime } from "@/lib/utils";

const REGION_COLOR = "#6366f1"; // indigo-500

// ─── KPI tile ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  accent,
  tooltip,
}: {
  label:    string;
  value?:   number;
  accent?:  "red" | "orange";
  tooltip:  string;
}) {
  const numCls =
    accent === "red"    ? "text-red-600"    :
    accent === "orange" ? "text-orange-500" :
    "text-foreground";

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-1 mb-3">
        <p className="text-xs font-medium text-muted-foreground leading-none">{label}</p>
        <UITooltip>
          <TooltipTrigger asChild>
            <Info className="size-3 text-muted-foreground/60 cursor-default shrink-0" />
          </TooltipTrigger>
          <TooltipContent className="max-w-52 text-xs leading-relaxed px-3 py-2">
            {tooltip}
          </TooltipContent>
        </UITooltip>
      </div>
      {value === undefined
        ? <Skeleton className="h-9 w-14" />
        : <p className={`text-4xl font-light tracking-tight ${numCls}`}>{value}</p>
      }
    </div>
  );
}

// ─── Region chart ─────────────────────────────────────────────────────────────

function RegionChart({ byRegion }: { byRegion: Record<string, number> }) {
  const data = Object.entries(byRegion)
    .map(([name, value]) => ({ name, value, fill: REGION_COLOR }))
    .sort((a, b) => b.value - a.value);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        No region data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 36)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 32, bottom: 0, left: 8 }}
        barSize={14}
      >
        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={72}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const { name, value } = payload[0].payload;
            return (
              <div style={{
                background: "var(--background)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "6px 10px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                fontSize: 12,
              }}>
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full shrink-0" style={{ background: REGION_COLOR }} />
                  <span className="font-medium">{name}</span>
                  <span className="tabular-nums ml-1" style={{ color: "var(--muted-foreground)" }}>{value}</span>
                </div>
              </div>
            );
          }}
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
        />
        <Bar dataKey="value" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: stats, dataUpdatedAt, refetch, isFetching } = useIssueStats({ refetchInterval: 60_000 });

  const ts        = dataUpdatedAt ?? 0;
  const isLoading = !stats;

  return (
    <div className="space-y-6 p-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Workspace-wide issue health</p>
        </div>
        {ts > 0 && (
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Updated {relativeTime(ts)}
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Open Issues"
          value={stats?.summary.totalOpen}
          tooltip="All issues currently open across the workspace (New, In Progress, On Hold)."
        />
        <KpiCard
          label="Critical"
          value={stats?.summary.critical}
          accent="red"
          tooltip="Open issues with Critical priority — require immediate attention."
        />
        <KpiCard
          label="SLA at Risk"
          value={stats?.summary.atSlaRisk}
          accent="orange"
          tooltip="Open issues whose SLA deadline expires within the next 24 hours."
        />
        <KpiCard
          label="Resolved This Week"
          value={stats?.summary.resolvedThisWeek}
          tooltip="Issues marked resolved in the last 7 days across the workspace."
        />
      </div>

      {/* Status + Priority + Activity charts */}
      <DashboardCharts stats={stats} />

      {/* By Region */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="text-sm font-semibold">Issues by Region</p>
          <UITooltip>
            <TooltipTrigger asChild>
              <Info className="size-3.5 text-muted-foreground cursor-default shrink-0" />
            </TooltipTrigger>
            <TooltipContent className="max-w-56 text-xs leading-relaxed px-3 py-2">
              Total issues per client region across the workspace, sorted by volume.
            </TooltipContent>
          </UITooltip>
        </div>
        <p className="text-xs text-muted-foreground mb-4">All issues grouped by client company region</p>
        {isLoading
          ? <Skeleton className="h-40 w-full" />
          : <RegionChart byRegion={stats.byRegion ?? {}} />
        }
      </div>

    </div>
  );
}
