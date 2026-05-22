import { LogOut, User, Home, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useTabsStore, type AppTab } from "@/store/tabs.store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { STATUS_CONFIG, PRIORITY_CONFIG, ROLE_LABEL } from "@/lib/theme";

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { tabs, activeId, closeTab, setActive } = useTabsStore();

  const handleTabClick = (tab: AppTab) => {
    setActive(tab.id);
    navigate(tab.path);
  };

  const handleClose = (e: React.MouseEvent, tab: AppTab) => {
    e.stopPropagation();
    const state = useTabsStore.getState();
    const idx = state.tabs.findIndex((t) => t.id === tab.id);
    const next = state.tabs.filter((t) => t.id !== tab.id);
    if (state.activeId === tab.id) {
      const newActive = next[Math.max(0, idx - 1)] ?? next[0];
      navigate(newActive?.path ?? "/");
    }
    closeTab(tab.id);
  };

  return (
    <header className="flex h-14 border-b bg-muted/30 shrink-0">
      {/* ── Tabs (sit flush at the bottom of the header) ───────────── */}
      <div className="flex flex-1 items-end overflow-x-auto min-w-0 px-2 gap-0.5 scrollbar-none [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          const isIssueTab = tab.id.startsWith("issue:");

          const tabButton = (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab)}
              className={cn(
                "group relative flex items-center gap-1.5 px-3.5 text-xs font-medium",
                "rounded-t-lg transition-all whitespace-nowrap shrink-0 select-none",
                isActive
                  ? [
                      "h-9 bg-background border border-border border-b-0",
                      "text-foreground -mb-px z-10",
                      "before:absolute before:bottom-0 before:-left-2 before:size-2",
                      "before:rounded-br-full before:[box-shadow:4px_4px_0_4px_var(--background)]",
                      "after:absolute after:bottom-0 after:-right-2 after:size-2",
                      "after:rounded-bl-full after:[box-shadow:-4px_4px_0_4px_var(--background)]",
                    ]
                  : [
                      "h-8 text-muted-foreground",
                      "hover:bg-background/60 hover:text-foreground hover:h-9",
                    ],
              )}
            >
              {tab.id === "home" && <Home className="size-3 shrink-0" />}
              <span className="max-w-35 truncate">{tab.label}</span>

              {tab.closeable && (
                <span
                  role="button"
                  aria-label="Close tab"
                  onClick={(e) => handleClose(e, tab)}
                  className={cn(
                    "ml-0.5 shrink-0 flex items-center justify-center size-3.5 rounded",
                    "opacity-0 group-hover:opacity-100 transition-opacity",
                    "hover:bg-destructive/15 hover:text-destructive",
                  )}
                >
                  <X className="size-2.5" />
                </span>
              )}
            </button>
          );

          // Only wrap issue tabs that have meta in a tooltip
          if (!isIssueTab || !tab.meta) return tabButton;

          return (
            <Tooltip key={tab.id}>
              <TooltipTrigger asChild>{tabButton}</TooltipTrigger>
              <TooltipContent side="bottom" className="p-3 max-w-64">
                <p className="font-mono text-[10px] text-muted-foreground mb-1">
                  {tab.label}
                </p>
                <p className="text-sm font-medium leading-snug mb-2">
                  {tab.meta.title}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={cn(
                      "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium capitalize",
                      STATUS_CONFIG[tab.meta.status]?.cls ??
                        "bg-muted text-muted-foreground",
                    )}
                  >
                    {tab.meta.status.replace("_", " ")}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium capitalize",
                      PRIORITY_CONFIG[tab.meta.priority]?.cls ??
                        "bg-muted text-muted-foreground",
                    )}
                  >
                    {tab.meta.priority}
                  </span>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* ── User menu (pinned right, vertically centred) ────────────── */}
      <div className="flex items-center shrink-0 px-4 border-l border-border/60">
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent outline-none">
              <Avatar className="size-7">
                <AvatarFallback className="text-xs">
                  {initials(user.fullName)}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium">{user.fullName}</span>
              <Badge variant="secondary" className="text-xs">
                {ROLE_LABEL[user.role]}
              </Badge>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-medium">{user.fullName}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="mr-2 size-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={logout}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
