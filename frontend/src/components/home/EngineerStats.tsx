import { useNavigate } from "react-router-dom";
import { KpiCard } from "@/components/ui/kpi-card";
import type { useIssueStats } from "@/hooks/use-issues";

type Stats = ReturnType<typeof useIssueStats>["data"];

interface EngineerStatsProps {
  stats: Stats;
}

export function EngineerStats({ stats }: EngineerStatsProps) {
  const navigate = useNavigate();
  const ev = stats?.engineerView;

  const tiles: {
    label:      string;
    value:      number | undefined;
    accent?:    "red" | "orange";
    navViewId?: string;
  }[] = [
    { label: "My Open",            value: ev?.mine.open,             navViewId: "my_assigned" },
    { label: "My Critical",        value: ev?.mine.critical,         accent: "red", navViewId: "my_critical" },
    { label: "Pending Breach",     value: ev?.mine.atSlaRisk,        accent: "orange" },
    { label: "Resolved This Week", value: ev?.mine.resolvedThisWeek },
    { label: "Unassigned",         value: ev?.unassigned.open,       navViewId: "unassigned" },
    { label: "All Resolved",       value: ev?.mine.resolvedAll },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map(({ label, value, accent, navViewId }) => (
        <KpiCard
          key={label}
          label={label}
          value={value}
          accent={accent}
          onClick={navViewId ? () => navigate("/issues", { state: { viewId: navViewId } }) : undefined}
        />
      ))}
    </div>
  );
}
