import { useIssueStats } from "@/hooks/use-issues";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/utils";
import { STATUS_CONFIG } from "@/lib/theme";
import type { IssueStatus } from "@/types/issues";

function numClass(accent?: "red" | "orange") {
  if (accent === "red")    return "text-red-600";
  if (accent === "orange") return "text-orange-500";
  return "text-foreground";
}

interface TileProps {
  title:     string;
  value:     number | undefined;
  updatedAt: number;
  accent?:   "red" | "orange";
}

function KpiTile({ title, value, updatedAt, accent }: TileProps) {
  return (
    <Card>
      <CardContent className="p-5 flex flex-col gap-4">
        <p className="text-sm font-medium text-foreground/80 leading-snug">{title}</p>
        {value === undefined ? (
          <Skeleton className="h-14 w-16" />
        ) : (
          <p className={cn("text-6xl font-light tracking-tight", numClass(accent))}>
            {value}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {updatedAt > 0 ? `Updated ${relativeTime(updatedAt)}` : "Loading…"}
        </p>
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  tiles,
  isLoading,
  skeletonCount = 4,
}: {
  title:         string;
  tiles:         TileProps[];
  isLoading:     boolean;
  skeletonCount?: number;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold mb-3">{title}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: skeletonCount }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-5 flex flex-col gap-4">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-14 w-16" />
                  <Skeleton className="h-3 w-28" />
                </CardContent>
              </Card>
            ))
          : tiles.map((tile) => <KpiTile key={tile.title} {...tile} />)
        }
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: stats, dataUpdatedAt } = useIssueStats({ refetchInterval: 60_000 });

  const ts         = dataUpdatedAt ?? 0;
  const isLoading  = !stats;

  const overviewTiles: TileProps[] = [
    { title: "Open Issues",        value: stats?.summary.totalOpen,        updatedAt: ts              },
    { title: "Critical",           value: stats?.summary.critical,          updatedAt: ts, accent: "red"    },
    { title: "SLA at Risk",        value: stats?.summary.atSlaRisk,         updatedAt: ts, accent: "orange" },
    { title: "Resolved This Week", value: stats?.summary.resolvedThisWeek, updatedAt: ts              },
  ];

  const priorityTiles: TileProps[] = [
    { title: "Critical", value: stats?.byPriority?.["critical"] as number | undefined, updatedAt: ts, accent: "red"    },
    { title: "High",     value: stats?.byPriority?.["high"]     as number | undefined, updatedAt: ts, accent: "orange" },
    { title: "Moderate", value: stats?.byPriority?.["moderate"] as number | undefined, updatedAt: ts              },
    { title: "Low",      value: stats?.byPriority?.["low"]      as number | undefined, updatedAt: ts              },
  ];

  const statusTiles: TileProps[] = Object.entries(stats?.byStatus ?? {}).map(([status, count]) => ({
    title:     STATUS_CONFIG[status as IssueStatus]?.label ?? status.replace("_", " "),
    value:     count as number,
    updatedAt: ts,
  }));

  const regionTiles: TileProps[] = Object.entries(stats?.byRegion ?? {}).map(([region, count]) => ({
    title:     region,
    value:     count as number,
    updatedAt: ts,
  }));

  return (
    <div className="space-y-8 p-5">
      <Section title="Overview"    tiles={overviewTiles}  isLoading={isLoading} skeletonCount={4} />
      <Section title="By Priority" tiles={priorityTiles}  isLoading={isLoading} skeletonCount={4} />
      <Section title="By Status"   tiles={statusTiles}    isLoading={isLoading} skeletonCount={6} />
      <Section title="By Region"   tiles={regionTiles}    isLoading={isLoading} skeletonCount={3} />
    </div>
  );
}
