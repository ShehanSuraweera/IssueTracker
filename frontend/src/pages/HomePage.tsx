import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useIssueStats } from "@/hooks/use-issues";
import { useAuth } from "@/hooks/use-auth";
import { DashboardCharts } from "@/components/ui/dashboard-charts";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeKpis } from "@/components/home/HomeKpis";
import { MyWorkSection } from "@/components/home/MyWorkSection";
import { HighRiskIssuesCard } from "@/components/ai/HighRiskIssuesCard";
import { useAiEnabled } from "@/hooks/use-ai";

export default function HomePage() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const aiEnabled = useAiEnabled();

  const { data: stats, refetch: refetchStats } = useIssueStats({
    refetchInterval: 60_000,
  });

  const firstName = user?.fullName?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-7">
      <HomeHero firstName={firstName} />

      <HomeKpis
        stats={stats}
        isAdmin={hasRole("admin")}
        isEngineer={hasRole("engineer")}
      />

      {aiEnabled && hasRole("engineer") && <HighRiskIssuesCard />}

      <DashboardCharts stats={stats} />

      <MyWorkSection
        user={user ?? null}
        isEngineer={hasRole("engineer")}
        role={user?.role ?? ""}
        onRefresh={refetchStats}
      />

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
