import { TicketCheck, AlertTriangle, Clock, CheckCircle } from "lucide-react";
import { useIssueStats } from "@/hooks/use-issues";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface StatCardProps {
  label:   string;
  value:   number | undefined;
  icon:    React.ElementType;
  color:   string;
}

function StatCard({ label, value, icon: Icon, color }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`flex size-10 items-center justify-center rounded-lg ${color}`}>
          <Icon className="size-5 text-white" />
        </div>
        <div>
          {value === undefined ? (
            <Skeleton className="h-7 w-12 mb-1" />
          ) : (
            <p className="text-2xl font-bold">{value}</p>
          )}
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data: stats, isLoading } = useIssueStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Portfolio overview</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Open issues"       value={stats?.summary.totalOpen}        icon={TicketCheck}    color="bg-primary" />
        <StatCard label="Critical"          value={stats?.summary.critical}         icon={AlertTriangle}  color="bg-red-500" />
        <StatCard label="SLA at risk"       value={stats?.summary.atSlaRisk}        icon={Clock}          color="bg-orange-500" />
        <StatCard label="Resolved this week" value={stats?.summary.resolvedThisWeek} icon={CheckCircle}    color="bg-green-500" />
      </div>

      {/* By status + by priority */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">By Status</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(stats?.byStatus ?? {}).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between text-sm">
                    <span className="capitalize">{status.replace("_", " ")}</span>
                    <span className="font-medium">{count as number}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">By Priority</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(stats?.byPriority ?? {}).map(([priority, count]) => (
                  <div key={priority} className="flex items-center justify-between text-sm">
                    <span className="capitalize">{priority}</span>
                    <span className="font-medium">{count as number}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* By region */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">By Region</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex gap-6">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-24" />)}
            </div>
          ) : (
            <div className="flex gap-6">
              {Object.entries(stats?.byRegion ?? {}).map(([region, count]) => (
                <div key={region} className="text-center">
                  <p className="text-2xl font-bold">{count as number}</p>
                  <p className="text-xs text-muted-foreground">{region}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
