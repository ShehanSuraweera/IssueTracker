import { useNavigate } from "react-router-dom";
import { KpiCard } from "@/components/ui/kpi-card";
import { EngineerStats } from "@/components/home/EngineerStats";
import type { useIssueStats } from "@/hooks/use-issues";

type Stats = ReturnType<typeof useIssueStats>["data"];

interface HomeKpisProps {
  stats:      Stats;
  isAdmin:    boolean;
  isEngineer: boolean;
}

export function HomeKpis({ stats, isAdmin, isEngineer }: HomeKpisProps) {
  const navigate = useNavigate();

  return (
    <div>
      <h2 className="text-sm font-semibold">Important items</h2>
      <p className="text-xs text-muted-foreground mt-0.5 mb-3">
        Check these metrics to see the most important items to work on.
      </p>

      {isEngineer ? (
        <EngineerStats stats={stats} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard
            label={isAdmin ? "All Unassigned" : "Open"}
            value={isAdmin ? stats?.adminView?.unassignedOpen : stats?.summary.totalOpen}
            onClick={() => navigate("/issues", { state: { viewId: "unassigned" } })}
          />
          <KpiCard
            label="Critical"
            value={stats?.summary.critical}
            accent="red"
            onClick={() => navigate("/issues", { state: { viewId: "p_critical" } })}
          />
          <KpiCard
            label="SLA At Risk"
            value={stats?.summary.atSlaRisk}
            accent="orange"
          />
          <KpiCard
            label="Resolved This Week"
            value={stats?.summary.resolvedThisWeek}
          />
          <KpiCard
            label="Total Open"
            value={stats?.summary.totalOpen}
          />
        </div>
      )}
    </div>
  );
}
