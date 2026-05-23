import { useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Home, TicketCheck, SquarePen, LayoutDashboard, Building2, Package, Users, Settings,
  Pin, PinOff, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTabsStore } from "@/store/tabs.store";
import { Separator } from "@/components/ui/separator";
import { NewnopLogo } from "@/components/ui/newnop-logo";

interface NavItem {
  id: string;
  to: string;
  icon: React.ElementType;
  label: string;
  exact?: boolean;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: "home",            to: "/",                icon: Home,            label: "Home",      exact: true },
  { id: "issues",          to: "/issues",          icon: TicketCheck,     label: "Issues",    exact: true },
  { id: "new",             to: "/issues/new",      icon: SquarePen,       label: "New Issue", exact: true },
  { id: "admin-dashboard", to: "/admin/dashboard", icon: LayoutDashboard, label: "Dashboard", adminOnly: true },
  { id: "admin-companies", to: "/admin/companies", icon: Building2,       label: "Companies", adminOnly: true },
  { id: "admin-products",  to: "/admin/products",  icon: Package,         label: "Products",  adminOnly: true },
  { id: "admin-users",     to: "/admin/users",     icon: Users,           label: "Users",     adminOnly: true },
];

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const { hasRole }  = useAuth();
  const navigate     = useNavigate();
  const location     = useLocation();
  const { openTab }  = useTabsStore();

  const [locked, setLocked] = useState(
    () => localStorage.getItem("sidebar-locked") !== "false"
  );
  const [hovered, setHovered] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const isExpanded = locked || hovered || mobileOpen;
  const isPeeking  = !locked && hovered;

  const handleMouseEnter = () => {
    if (locked) return;
    hoverTimer.current = setTimeout(() => setHovered(true), 180);
  };

  const handleMouseLeave = () => {
    clearTimeout(hoverTimer.current);
    setHovered(false);
  };

  const toggle = () => {
    if (locked) {
      setLocked(false);
      localStorage.setItem("sidebar-locked", "false");
    } else {
      setLocked(true);
      localStorage.setItem("sidebar-locked", "true");
    }
  };

  const handleNav = (item: NavItem) => {
    openTab({ id: item.id, label: item.label, path: item.to });
    navigate(item.to);
    if (mobileOpen) onClose();
  };

  const handleSettings = () => {
    openTab({ id: "settings", label: "Settings", path: "/settings/password" });
    navigate("/settings/password");
    if (mobileOpen) onClose();
  };

  const isActive = (item: NavItem) =>
    item.exact
      ? location.pathname === item.to
      : location.pathname.startsWith(item.to);

  const isSettingsActive = location.pathname.startsWith("/settings");

  const itemClass = (active: boolean) =>
    cn(
      "flex w-full items-center rounded-md py-2 text-sm transition-colors",
      isExpanded ? "gap-2.5 px-3" : "justify-center",
      active
        ? "bg-primary text-primary-foreground"
        : "text-sidebar-foreground hover:bg-primary/10 hover:text-primary",
    );

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 sm:hidden"
          onClick={onClose}
        />
      )}

      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "flex h-screen flex-col border-r bg-sidebar text-sidebar-foreground shrink-0",
          "transition-[width,transform] duration-200 ease-in-out",
          // Mobile: fixed overlay; desktop: static in flow
          "fixed inset-y-0 left-0 z-50 sm:static sm:z-auto",
          // Mobile: slide in/out
          mobileOpen ? "translate-x-0" : "-translate-x-full sm:translate-x-0",
          isExpanded ? "w-56" : "w-14",
          isPeeking && "shadow-xl shadow-black/10",
          mobileOpen && "shadow-xl shadow-black/20",
        )}
      >
        {/* Logo + toggle */}
        <div className="flex h-14 items-center border-b shrink-0 overflow-hidden px-3 gap-2">
          {isExpanded ? (
            <>
              <NewnopLogo width={22} height={19} className="shrink-0" />
              <span className="font-semibold text-sm tracking-wide truncate flex-1">
                NewnopDesk
              </span>
              {/* Mobile: close button; Desktop: pin/unpin */}
              {mobileOpen ? (
                <button
                  onClick={onClose}
                  aria-label="Close menu"
                  className="sm:hidden flex items-center justify-center size-7 rounded-md shrink-0 transition-colors text-muted-foreground hover:bg-primary/10 hover:text-primary"
                >
                  <X className="size-3.5" />
                </button>
              ) : (
                <button
                  onClick={toggle}
                  aria-label={locked ? "Unpin sidebar" : "Pin sidebar open"}
                  title={locked ? "Unpin sidebar" : "Pin sidebar open"}
                  className="flex items-center justify-center size-7 rounded-md shrink-0 transition-colors text-muted-foreground hover:bg-primary/10 hover:text-primary"
                >
                  {locked ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                </button>
              )}
            </>
          ) : (
            <NewnopLogo width={22} height={19} className="mx-auto shrink-0" />
          )}
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {NAV_ITEMS.filter((item) => !item.adminOnly || hasRole("admin")).map((item) => (
            <button
              key={item.id}
              onClick={() => handleNav(item)}
              title={!isExpanded ? item.label : undefined}
              className={itemClass(isActive(item))}
            >
              <item.icon className="size-4 shrink-0" />
              {isExpanded && <span className="truncate">{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* Settings */}
        <div className="shrink-0 p-2">
          <Separator className="mb-2" />
          <button
            onClick={handleSettings}
            title={!isExpanded ? "Settings" : undefined}
            className={itemClass(isSettingsActive)}
          >
            <Settings className="size-4 shrink-0" />
            {isExpanded && <span className="truncate">Settings</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
