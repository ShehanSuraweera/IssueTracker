import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { AiTag, Pill } from "@/components/ai/ai-bits";
import { useAiEnabled, useClientHealth } from "@/hooks/use-ai";
import { TREND_STYLE } from "@/lib/ai-display";
import type { ClientHealthCompany } from "@/types/ai";

const RANGES = [30, 90, 180] as const;

export default function ClientHealthPage() {
  const aiEnabled = useAiEnabled();
  const [days, setDays] = useState<number>(90);
  const { data, isLoading, isError } = useClientHealth(days, aiEnabled);

  return (
    <div className="space-y-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            Client health <AiTag />
          </h1>
          <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">
            How each client's tone is changing, from AI sentiment on the issues and comments they
            write. An internal signal for account managers: it never changes an issue's priority.
          </p>
        </div>
        <div className="flex rounded-md border p-0.5 text-xs" role="group" aria-label="Time range">
          {RANGES.map((range) => (
            <button
              key={range}
              onClick={() => setDays(range)}
              className={
                range === days
                  ? "rounded bg-primary px-2.5 py-1 font-medium text-primary-foreground"
                  : "rounded px-2.5 py-1 text-muted-foreground hover:text-foreground"
              }
            >
              {range} days
            </button>
          ))}
        </div>
      </div>

      {!aiEnabled && (
        <p className="text-sm text-muted-foreground">AI features are turned off for this workspace.</p>
      )}
      {isLoading && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}
      {isError && <p className="text-sm text-muted-foreground">Client health is unavailable right now.</p>}
      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.companies.map((company) => (
            <CompanyHealthCard key={company.companyId} company={company} />
          ))}
        </div>
      )}
    </div>
  );
}

function CompanyHealthCard({ company }: { company: ClientHealthCompany }) {
  const trend = TREND_STYLE[company.trend];
  const chartData = company.weeks.map((w) => ({
    week: w.weekStart.slice(5),
    frustration: w.avgFrustration,
    messages: w.entries,
  }));

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{company.name}</p>
          <p className="text-xs text-muted-foreground">{company.region}</p>
        </div>
        <Pill className={trend.cls}>{trend.label}</Pill>
      </div>

      <dl className="my-4 grid grid-cols-3 gap-3 text-center">
        <Stat label="Last 30 days" value={fmtScore(company.recentAvgFrustration)} hint="avg frustration" />
        <Stat label="30 days before" value={fmtScore(company.previousAvgFrustration)} hint="avg frustration" />
        <Stat
          label="High risk"
          value={String(company.openHighRiskIssues)}
          hint="open issues"
          alert={company.openHighRiskIssues > 0}
        />
      </dl>

      {chartData.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">No client messages analysed in this period.</p>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis domain={[1, 5]} ticks={[1, 3, 5]} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }}
              formatter={(value, name) => [value, name === "frustration" ? "Avg frustration" : name]}
              labelFormatter={(label) => `Week of ${label}`}
            />
            <Line type="monotone" dataKey="frustration" stroke="#e11d48" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function Stat({ label, value, hint, alert }: { label: string; value: string; hint: string; alert?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={alert ? "text-lg font-semibold text-red-600" : "text-lg font-semibold"}>{value}</dd>
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function fmtScore(score: number | null): string {
  return score === null ? "–" : `${score.toFixed(1)}/5`;
}
