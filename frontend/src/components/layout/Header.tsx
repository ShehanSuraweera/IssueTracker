import { LogOut, User, Home, X, Pin, Menu } from "lucide-react";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { tabs, activeId, closeTab, setActive, pinnedId, pinTab } = useTabsStore();

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

  const homeTab = tabs.find((t) => t.id === "home")!;
  const pinnedTab = pinnedId ? (tabs.find((t) => t.id === pinnedId) ?? null) : null;
  const restTabs = tabs.filter((t) => t.id !== "home" && t.id !== pinnedId);

  const renderTab = (tab: AppTab) => {
    const isActive = tab.id === activeId;
    const isPinned = tab.id === pinnedId;
    const isIssueTab = tab.id.startsWith("issue:");

    const tabButton = (
      <button
        key={tab.id}
        onClick={() => handleTabClick(tab)}
        style={isActive ? { borderTopColor: "var(--brand-green)", borderTopWidth: "2px" } : undefined}
        className={cn(
          "group relative flex items-center gap-2 px-4 text-[13px] font-medium",
          "rounded-t-lg transition-all whitespace-nowrap shrink-0 select-none",
          isActive
            ? [
                "h-10 bg-background border border-border border-b-0 shadow-sm",
                "text-foreground -mb-px z-10",
                "before:absolute before:bottom-0 before:-left-2 before:size-2",
                "before:rounded-br-full before:[box-shadow:4px_4px_0_4px_var(--background)]",
                "after:absolute after:bottom-0 after:-right-2 after:size-2",
                "after:rounded-bl-full after:[box-shadow:-4px_4px_0_4px_var(--background)]",
              ]
            : [
                "h-9 bg-muted/60 border border-border border-b-0 text-muted-foreground",
                "hover:bg-background/80 hover:text-foreground hover:h-10",
              ],
        )}
      >
        {tab.id === "home" && <Home className="size-3.5 shrink-0" />}
        <span className="max-w-35 truncate">{tab.label}</span>

        {/* Pin button — always visible (green) when pinned, fades in on hover otherwise */}
        {tab.id !== "home" && (
          <span
            role="button"
            aria-label={isPinned ? "Unpin tab" : "Pin tab"}
            onClick={(e) => { e.stopPropagation(); pinTab(tab.id); }}
            style={isPinned ? { color: "var(--brand-green)" } : undefined}
            className={cn(
              "shrink-0 flex items-center justify-center size-4 rounded transition-all",
              isPinned
                ? "opacity-100 hover:opacity-50"
                : "opacity-0 group-hover:opacity-50 hover:opacity-100",
            )}
          >
            <Pin
              className="size-3 rotate-45"
              fill={isPinned ? "currentColor" : "none"}
            />
          </span>
        )}

        {tab.closeable && (
          <span
            role="button"
            aria-label="Close tab"
            onClick={(e) => handleClose(e, tab)}
            className={cn(
              "shrink-0 flex items-center justify-center size-4 rounded",
              "opacity-0 group-hover:opacity-100 transition-opacity",
              "hover:bg-destructive/15 hover:text-destructive",
            )}
          >
            <X className="size-3" />
          </span>
        )}
      </button>
    );

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
                STATUS_CONFIG[tab.meta.status]?.cls ?? "bg-muted text-muted-foreground",
              )}
            >
              {tab.meta.status.replace("_", " ")}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium capitalize",
                PRIORITY_CONFIG[tab.meta.priority]?.cls ?? "bg-muted text-muted-foreground",
              )}
            >
              {tab.meta.priority}
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <header className="flex h-14 border-b bg-linear-to-b from-background to-muted/50 shrink-0">
      {/* ── Mobile hamburger ───────────────────────────────────────── */}
      <div className="flex sm:hidden flex-1 items-center px-3">
        <button
          onClick={onMenuClick}
          aria-label="Open menu"
          className="flex items-center justify-center size-8 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Menu className="size-5" />
        </button>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────── */}
      <div className="hidden sm:flex flex-1 items-end overflow-x-auto min-w-0 px-2 gap-0.5 scrollbar-none [&::-webkit-scrollbar]:hidden">
        {renderTab(homeTab)}

        {pinnedTab && (
          <>
            {renderTab(pinnedTab)}
            {restTabs.length > 0 && (
              <div className="self-center h-4 w-px bg-border mx-1 shrink-0" />
            )}
          </>
        )}

        {restTabs.map((tab) => renderTab(tab))}
      </div>

      {/* ── User menu ──────────────────────────────────────────────── */}
      <div className="flex items-center shrink-0 px-2 sm:px-4 border-l border-border/60">
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent outline-none">
              <Avatar className="size-7">
                <AvatarFallback className="text-xs text-white bg-brand-green">
                  {initials(user.fullName)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:block font-medium">{user.fullName}</span>
              <Badge variant="outline" className="hidden sm:inline-flex text-xs border-brand-green/40 bg-brand-green/10 text-brand-green">
                {ROLE_LABEL[user.role]}
              </Badge>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-medium">{user.fullName}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/settings/profile")}>
                <User className="mr-2 size-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <ConfirmDialog
                trigger={
                  <DropdownMenuItem
                    onSelect={e => e.preventDefault()}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 size-4" />
                    Sign out
                  </DropdownMenuItem>
                }
                title="Sign out?"
                description="You'll be signed out of your account. Any unsaved changes will be lost."
                confirmLabel="Sign out"
                variant="destructive"
                onConfirm={logout}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
