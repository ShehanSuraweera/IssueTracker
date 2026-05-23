import {
  PieChart, Pie,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip as UITooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/lib/theme";
import { useAuth } from "@/hooks/use-auth";
import type { IssueStats } from "@/types/issues";

const PRIORITY_ORDER = ["critical", "high", "moderate", "low"] as const;

// ─── Scope descriptions by role ───────────────────────────────────────────────

const SCOPE: Record<string, { status: string; priority: string; trend: string }> = {
  admin: {
    status:   "All issues across the entire workspace, grouped by current status.",
    priority: "All open issues across the workspace, grouped by priority level.",
    trend:    "Daily created vs resolved issues across the whole workspace. If created stays above resolved, the backlog is growing.",
  },
  engineer: {
    status:   "Issues from products assigned to you, grouped by current status.",
    priority: "Open issues from your assigned products, grouped by priority level.",
    trend:    "Daily created vs resolved issues from your assigned products. Use this to track whether your team is keeping up.",
  },
  client_user: {
    status:   "Issues submitted by your company, grouped by current status.",
    priority: "Your company's open issues, grouped by priority level.",
    trend:    "Daily created vs resolved issues for your company over the last 7 days.",
  },
};

function InfoTooltip({ text }: { text: string }) {
  return (
    <UITooltip>
      <TooltipTrigger asChild>
        <Info className="size-3.5 text-muted-foreground cursor-default shrink-0" />
      </TooltipTrigger>
      <TooltipContent className="max-w-56 text-xs leading-relaxed px-3 py-2">
        {text}
      </TooltipContent>
    </UITooltip>
  );
}

// ─── Shared tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number; payload: { fill: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const { name, value, payload: { fill } } = payload[0];
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
        <span className="size-2 rounded-full shrink-0" style={{ background: fill }} />
        <span className="font-medium">{name}</span>
        <span className="tabular-nums ml-1" style={{ color: "var(--muted-foreground)" }}>{value}</span>
      </div>
    </div>
  );
}

// ─── Status donut ─────────────────────────────────────────────────────────────

function StatusDonut({ byStatus }: { byStatus: Record<string, number> }) {
  const data = (Object.keys(STATUS_CONFIG) as (keyof typeof STATUS_CONFIG)[])
    .filter(key => (byStatus[key] ?? 0) > 0)
    .map(key => ({
      name:  STATUS_CONFIG[key].label,
      value: byStatus[key],
      fill:  STATUS_CONFIG[key].hex,   // v3: fill on data item, no Cell needed
    }));

  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        No open issues
      </div>
    );
  }

  return (
    <div className="flex items-center gap-6">
      {/* Donut */}
      <div className="relative shrink-0" style={{ width: 160, height: 160 }}>
        {/* Centre text rendered first (lower DOM order = lower z-index than tooltip) */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-semibold tabular-nums leading-none">{total}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Total</span>
        </div>
        {/* Chart rendered after — Recharts tooltip sits above the centre text */}
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={72}
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
            />
            <Tooltip
              content={<ChartTooltip />}
              wrapperStyle={{ zIndex: 10 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="space-y-2">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <span className="size-2 rounded-full shrink-0" style={{ background: d.fill }} />
            <span className="text-muted-foreground">{d.name}</span>
            <span className="tabular-nums font-semibold">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Priority bar ─────────────────────────────────────────────────────────────

function PriorityBar({ byPriority }: { byPriority: Record<string, number> }) {
  const data = PRIORITY_ORDER
    .filter(key => byPriority[key] !== undefined)
    .map(key => ({
      name:  PRIORITY_CONFIG[key].label,
      value: byPriority[key] ?? 0,
      fill:  PRIORITY_CONFIG[key].hex,  // v3: fill on data item, no Cell needed
    }));

  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        No open issues
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 32, bottom: 0, left: 4 }}
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
          width={60}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          content={<ChartTooltip />}
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
        />
        <Bar dataKey="value" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── 7-day resolved trend ─────────────────────────────────────────────────────

function dayLabel(dateStr: string): string {
  const d    = new Date(dateStr);
  const now  = new Date();
  // compare UTC dates
  if (dateStr === now.toISOString().split("T")[0]) return "Today";
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

const TREND_CREATED  = "#3b82f6"; // blue-500
const TREND_RESOLVED = "var(--brand-green)";

function ResolvedTrend({ trend }: { trend: { date: string; resolved: number; created: number }[] }) {
  const data = trend.map(t => ({ ...t, label: dayLabel(t.date) }));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
        <defs>
          <linearGradient id="fillResolved" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={TREND_RESOLVED} stopOpacity={0.2} />
            <stop offset="95%" stopColor={TREND_RESOLVED} stopOpacity={0}   />
          </linearGradient>
          <linearGradient id="fillCreated" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={TREND_CREATED} stopOpacity={0.15} />
            <stop offset="95%" stopColor={TREND_CREATED} stopOpacity={0}    />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const { label, created, resolved } = payload[0].payload;
            return (
              <div style={{
                background: "var(--background)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "6px 10px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                fontSize: 12,
              }}>
                <p className="font-medium mb-1.5">{label}</p>
                <div className="flex items-center gap-2 mb-1">
                  <span className="size-2 rounded-full shrink-0" style={{ background: TREND_CREATED }} />
                  <span style={{ color: "var(--muted-foreground)" }}>Created</span>
                  <span className="tabular-nums font-semibold ml-auto pl-3">{created}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full shrink-0" style={{ background: TREND_RESOLVED }} />
                  <span style={{ color: "var(--muted-foreground)" }}>Resolved</span>
                  <span className="tabular-nums font-semibold ml-auto pl-3">{resolved}</span>
                </div>
              </div>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="created"
          stroke={TREND_CREATED}
          strokeWidth={2}
          fill="url(#fillCreated)"
          dot={{ r: 3, fill: TREND_CREATED, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: TREND_CREATED, strokeWidth: 0 }}
        />
        <Area
          type="monotone"
          dataKey="resolved"
          stroke={TREND_RESOLVED}
          strokeWidth={2}
          fill="url(#fillResolved)"
          dot={{ r: 3, fill: TREND_RESOLVED, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: TREND_RESOLVED, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function DashboardCharts({ stats }: { stats: IssueStats | undefined }) {
  const { user } = useAuth();
  const scope = SCOPE[user?.role ?? "admin"];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="text-sm font-semibold">Issues by Status</p>
          <InfoTooltip text={scope.status} />
        </div>
        <p className="text-xs text-muted-foreground mb-4">Distribution across all active states</p>
        {!stats
          ? <Skeleton className="h-40 w-full" />
          : <StatusDonut byStatus={stats.byStatus} />
        }
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="text-sm font-semibold">Issues by Priority</p>
          <InfoTooltip text={scope.priority} />
        </div>
        <p className="text-xs text-muted-foreground mb-4">Open issues grouped by severity</p>
        {!stats
          ? <Skeleton className="h-40 w-full" />
          : <PriorityBar byPriority={stats.byPriority} />
        }
      </div>

      <div className="rounded-xl border bg-card p-5 md:col-span-2">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <p className="text-sm font-semibold">Activity — Last 7 Days</p>
              <InfoTooltip text={scope.trend} />
            </div>
            <p className="text-xs text-muted-foreground">Daily created vs resolved issues</p>
          </div>
          {stats && (
            <div className="flex items-center gap-4 text-right">
              <div>
                <p className="text-2xl font-semibold tabular-nums" style={{ color: TREND_CREATED }}>
                  {stats.resolvedTrend.reduce((s, t) => s + t.created, 0)}
                </p>
                <p className="text-[10px] text-muted-foreground">created</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums" style={{ color: TREND_RESOLVED }}>
                  {stats.resolvedTrend.reduce((s, t) => s + t.resolved, 0)}
                </p>
                <p className="text-[10px] text-muted-foreground">resolved</p>
              </div>
            </div>
          )}
        </div>
        {!stats
          ? <Skeleton className="h-40 w-full" />
          : <ResolvedTrend trend={stats.resolvedTrend} />
        }
      </div>

    </div>
  );
}
