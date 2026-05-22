import { useState, useRef } from "react";
import { NavLink } from "react-router-dom";
import {
  Home, TicketCheck, SquarePen, LayoutDashboard, Building2, Package, Users, Settings,
  Pin, PinOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Separator } from "@/components/ui/separator";
import { NewnopLogo } from "@/components/ui/newnop-logo";

interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  end?: boolean;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/",                 icon: Home,            label: "Home",      end: true },
  { to: "/issues",           icon: TicketCheck,     label: "Issues",    end: true },
  { to: "/issues/new",       icon: SquarePen,       label: "New Issue", end: true },
  { to: "/admin/dashboard",  icon: LayoutDashboard, label: "Dashboard", adminOnly: true },
  { to: "/admin/companies",  icon: Building2,       label: "Companies", adminOnly: true },
  { to: "/admin/products",   icon: Package,         label: "Products",  adminOnly: true },
  { to: "/admin/users",      icon: Users,           label: "Users",     adminOnly: true },
];

export function Sidebar() {
  const { hasRole } = useAuth();

  // locked = stays expanded permanently (persisted)
  // hovered = peek-expand on hover (temporary)
  const [locked, setLocked] = useState(
    () => localStorage.getItem("sidebar-locked") !== "false"
  );
  const [hovered, setHovered] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const isExpanded = locked || hovered;
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
      // Unlock → back to hover mode
      setLocked(false);
      localStorage.setItem("sidebar-locked", "false");
    } else {
      // Lock open (works from both collapsed and peek state)
      setLocked(true);
      localStorage.setItem("sidebar-locked", "true");
    }
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex w-full items-center rounded-md py-2 text-sm transition-colors",
      isExpanded ? "gap-2.5 px-3" : "justify-center",
      isActive
        ? "bg-primary text-primary-foreground"
        : "text-sidebar-foreground hover:bg-primary/10 hover:text-primary"
    );

  return (
    <aside
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "flex h-screen flex-col border-r bg-sidebar text-sidebar-foreground shrink-0",
        "transition-[width] duration-200 ease-in-out",
        isExpanded ? "w-56" : "w-14",
        // subtle shadow when peeking to signal the panel is floating temporarily
        isPeeking && "shadow-xl shadow-black/10",
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
            <button
              onClick={toggle}
              aria-label={locked ? "Unpin sidebar" : "Pin sidebar open"}
              title={locked ? "Unpin sidebar" : "Pin sidebar open"}
              className="flex items-center justify-center size-7 rounded-md shrink-0 transition-colors text-muted-foreground hover:bg-primary/10 hover:text-primary"
            >
              {locked
                ? <PinOff className="size-3.5" />
                : <Pin    className="size-3.5" />
              }
            </button>
          </>
        ) : (
          <NewnopLogo width={22} height={19} className="mx-auto shrink-0" />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {NAV_ITEMS.filter((item) => !item.adminOnly || hasRole("admin")).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={!isExpanded ? item.label : undefined}
            className={navLinkClass}
          >
            <item.icon className="size-4 shrink-0" />
            {isExpanded && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Settings */}
      <div className="shrink-0 p-2">
        <Separator className="mb-2" />
        <NavLink
          to="/settings/password"
          title={!isExpanded ? "Settings" : undefined}
          className={navLinkClass}
        >
          <Settings className="size-4 shrink-0" />
          {isExpanded && <span className="truncate">Settings</span>}
        </NavLink>
      </div>
    </aside>
  );
}
