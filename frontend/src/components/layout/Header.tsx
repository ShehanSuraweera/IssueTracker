import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { LogOut, User, Home, X, Pin, Menu, ChevronDown, Check } from "lucide-react";
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

/**
 * Tracks whether a horizontally scrolling element has hidden content on
 * either side, so the tab strip can show fades and the overflow menu.
 */
function useHorizontalOverflow(deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setState((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  // Tabs opened, closed or renamed change the content width without resizing the strip
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(measure, deps);

  return { ref, measure, overflowLeft: state.left, overflowRight: state.right };
}

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { tabs, activeId, closeTab, closeOthers, setActive, pinnedId, pinTab } =
    useTabsStore();

  const homeTab = tabs.find((t) => t.id === "home")!;
  const pinnedTab = pinnedId
    ? (tabs.find((t) => t.id === pinnedId) ?? null)
    : null;
  const restTabs = tabs.filter((t) => t.id !== "home" && t.id !== pinnedId);

  const {
    ref: stripRef,
    measure: measureStrip,
    overflowLeft,
    overflowRight,
  } = useHorizontalOverflow([tabs]);
  const overflowing = overflowLeft || overflowRight;

  // Keep the active tab visible, e.g. when an issue opens in a new tab at the end
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(
      `[data-tab-id="${CSS.escape(activeId)}"]`,
    );
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [activeId, tabs.length, stripRef]);

  const handleTabClick = (tab: AppTab) => {
    setActive(tab.id);
    navigate(tab.path);
  };

  const closeById = (id: string) => {
    const state = useTabsStore.getState();
    const tab = state.tabs.find((t) => t.id === id);
    if (!tab?.closeable) return;
    if (state.activeId === id) {
      const idx = state.tabs.findIndex((t) => t.id === id);
      const next = state.tabs.filter((t) => t.id !== id);
      const newActive = next[Math.max(0, idx - 1)] ?? next[0];
      navigate(newActive?.path ?? "/");
    }
    closeTab(id);
  };

  const handleClose = (e: React.MouseEvent, tab: AppTab) => {
    e.stopPropagation();
    closeById(tab.id);
  };

  const handleCloseOthers = () => {
    const active = tabs.find((t) => t.id === activeId) ?? homeTab;
    closeOthers(active.id);
    navigate(active.path);
  };

  // A vertical mouse wheel scrolls the strip sideways, as in browsers and editors
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.currentTarget.scrollLeft += e.deltaY;
    }
  };

  const renderTab = (tab: AppTab, { shrinkable }: { shrinkable: boolean }) => {
    const isActive = tab.id === activeId;
    const isPinned = tab.id === pinnedId;
    const isIssueTab = tab.id.startsWith("issue:");

    const tabButton = (
      <button
        key={tab.id}
        data-tab-id={tab.id}
        onClick={() => handleTabClick(tab)}
        // Middle click closes a tab, as in browsers
        onAuxClick={(e) => {
          if (e.button === 1) handleClose(e, tab);
        }}
        style={
          isActive
            ? { borderTopColor: "var(--brand-green)", borderTopWidth: "2px" }
            : undefined
        }
        className={cn(
          "group relative flex items-center gap-2 text-[13px] font-medium",
          "rounded-t-lg transition-all whitespace-nowrap select-none",
          // Issue tabs shrink before the strip starts to scroll, but never below
          // the width of a full ticket number (e.g. APTWEB-0002): a tab you can't
          // read is worse than one you scroll to. The tooltip shows the title.
          shrinkable ? "flex-[0_1_12rem] min-w-40 px-3" : "shrink-0 px-4",
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
        <span className={cn("truncate", shrinkable ? "min-w-0 flex-1 text-left" : "max-w-35")}>
          {tab.label}
        </span>

        {tab.id !== "home" && (
          <span
            role="button"
            aria-label={isPinned ? "Unpin tab" : "Pin tab"}
            onClick={(e) => {
              e.stopPropagation();
              pinTab(tab.id);
            }}
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
              // Always visible on the active tab, so narrow tabs can still be closed
              isActive ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-100",
              "transition-opacity hover:bg-destructive/15 hover:text-destructive",
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
  };

  const openIssueTabs = tabs.filter((t) => t.closeable);

  return (
    <header className="flex h-14 border-b bg-linear-to-b from-background to-muted/50 shrink-0">
      <div className="flex sm:hidden flex-1 items-center px-3">
        <button
          onClick={onMenuClick}
          aria-label="Open menu"
          className="flex items-center justify-center size-8 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Menu className="size-5" />
        </button>
      </div>

      <div className="hidden sm:flex flex-1 items-end min-w-0 pl-2 gap-0.5">
        {/* Home and the pinned tab never scroll out of view */}
        {renderTab(homeTab, { shrinkable: false })}
        {pinnedTab && (
          <>
            {renderTab(pinnedTab, { shrinkable: false })}
            {restTabs.length > 0 && (
              <div className="self-center h-4 w-px bg-border mx-1 shrink-0" />
            )}
          </>
        )}

        <div className="relative flex flex-1 min-w-0 self-stretch">
          <div
            ref={stripRef}
            onScroll={measureStrip}
            onWheel={handleWheel}
            className="flex flex-1 items-end gap-0.5 overflow-x-auto overflow-y-hidden px-2 scrollbar-none [&::-webkit-scrollbar]:hidden"
          >
            {restTabs.map((tab) => renderTab(tab, { shrinkable: true }))}
          </div>
          {/* Fades show that more tabs are hidden on that side */}
          {overflowLeft && (
            <div className="pointer-events-none absolute inset-y-0 left-0 w-8 z-20 bg-linear-to-r from-background to-transparent" />
          )}
          {overflowRight && (
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 z-20 bg-linear-to-l from-background to-transparent" />
          )}
        </div>

        {overflowing && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger
                  aria-label={`All open tabs (${openIssueTabs.length})`}
                  className="self-center mx-1 flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 h-7 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent outline-none"
                >
                  {openIssueTabs.length}
                  <ChevronDown className="size-3.5" />
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">All open tabs</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-80 max-h-[70vh] overflow-y-auto">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {openIssueTabs.length} open {openIssueTabs.length === 1 ? "tab" : "tabs"}
              </DropdownMenuLabel>
              {tabs.map((tab) => {
                const isActive = tab.id === activeId;
                return (
                  <DropdownMenuItem
                    key={tab.id}
                    onSelect={() => handleTabClick(tab)}
                    className={cn("group gap-2", isActive && "bg-accent/60")}
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      {isActive ? (
                        <Check className="size-3.5 text-brand-green" />
                      ) : tab.id === "home" ? (
                        <Home className="size-3.5 text-muted-foreground" />
                      ) : tab.id === pinnedId ? (
                        <Pin className="size-3 rotate-45 text-muted-foreground" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{tab.label}</span>
                      {tab.meta && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {tab.meta.title}
                        </span>
                      )}
                    </span>
                    {tab.meta && (
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium capitalize",
                          STATUS_CONFIG[tab.meta.status]?.cls ?? "bg-muted text-muted-foreground",
                        )}
                      >
                        {tab.meta.status.replace("_", " ")}
                      </span>
                    )}
                    {tab.closeable && (
                      <span
                        role="button"
                        aria-label={`Close ${tab.label}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          closeById(tab.id);
                        }}
                        className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 group-focus:opacity-100 hover:bg-destructive/15 hover:text-destructive"
                      >
                        <X className="size-3" />
                      </span>
                    )}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={handleCloseOthers}
                disabled={openIssueTabs.every((t) => t.id === activeId || t.id === pinnedId)}
                className="text-[13px]"
              >
                Close other tabs
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex items-center shrink-0 px-2 sm:px-4 border-l border-border/60">
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent outline-none">
              <Avatar className="size-7">
                <AvatarFallback className="text-xs text-white bg-brand-green">
                  {initials(user.fullName)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:block font-medium">
                {user.fullName}
              </span>
              <Badge
                variant="outline"
                className="hidden sm:inline-flex text-xs border-brand-green/40 bg-brand-green/10 text-brand-green"
              >
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
                    onSelect={(e) => e.preventDefault()}
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
