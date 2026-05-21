import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useTabsStore } from "@/store/tabs.store";

export function AppShell() {
  const location = useLocation();
  const { tabs, openTab, setActive } = useTabsStore();

  useEffect(() => {
    const path = location.pathname;

    if (path === "/") {
      setActive("home");
      return;
    }

    const existing = tabs.find((t) => t.path === path);
    if (existing) {
      setActive(existing.id);
      return;
    }

    const m = path.match(/^\/issues\/([^/]+)$/);
    if (m) {
      const issueId = m[1];
      openTab({ id: `issue:${issueId}`, label: issueId.slice(0, 8) + "…", path });
    }
  }, [location.pathname]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto bg-background p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
