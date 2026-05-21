import { NavLink } from "react-router-dom";
import {
  TicketCheck, LayoutDashboard, Building2, Package, Users, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Separator } from "@/components/ui/separator";
import { NewnopLogo } from "@/components/ui/newnop-logo";

interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/issues",           icon: TicketCheck,     label: "Issues" },
  { to: "/admin/dashboard",  icon: LayoutDashboard, label: "Dashboard",  adminOnly: true },
  { to: "/admin/companies",  icon: Building2,       label: "Companies",  adminOnly: true },
  { to: "/admin/products",   icon: Package,         label: "Products",   adminOnly: true },
  { to: "/admin/users",      icon: Users,           label: "Users",      adminOnly: true },
];

export function Sidebar() {
  const { hasRole } = useAuth();

  return (
    <aside className="flex h-screen w-56 flex-col border-r bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <NewnopLogo width={22} height={19} />
        <span className="font-semibold text-sm tracking-wide">NewnopDesk</span>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
        {NAV_ITEMS.filter((item) => !item.adminOnly || hasRole("admin")).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-foreground hover:bg-primary/10 hover:text-primary"
              )
            }
          >
            <item.icon className="size-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div className="p-3">
        <Separator className="mb-3" />
        <NavLink
          to="/settings/password"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-sidebar-foreground hover:bg-primary/10 hover:text-primary"
            )
          }
        >
          <Settings className="size-4" />
          Settings
        </NavLink>
      </div>
    </aside>
  );
}

