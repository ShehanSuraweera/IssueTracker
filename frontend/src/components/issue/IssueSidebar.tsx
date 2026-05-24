import { ChevronDown, ChevronRight, Loader2, PanelLeftClose, Pencil, Pin, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { NavGroup, NavItem } from "@/hooks/use-issue-list-state";
import type { SavedView } from "@/types/issues";

interface Props {
  // Layout
  sidebarOpen: boolean;
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
  openSidebarClose: () => void;
  // Tab
  activeTab: "default" | "my";
  setActiveTab: (tab: "default" | "my") => void;
  // Default nav
  sortedGroups: NavGroup[];
  collapsed: Set<string>;
  pinned: Set<string>;
  activeViewId: string;
  toggleCollapse: (label: string) => void;
  togglePin: (label: string) => void;
  selectView: (item: NavItem) => void;
  // Saved views
  savedViews: SavedView[];
  savedViewsLoading: boolean;
  selectSavedView: (view: SavedView) => void;
  deleteSavedView: (id: string) => void;
  deleteSavedViewMutation: { isPending: boolean };
  // Rename
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
  renameName: string;
  setRenameName: (name: string) => void;
  renameError: string;
  setRenameError: (err: string) => void;
  commitRename: (viewId: string) => void;
  renameSavedViewMutation: { isPending: boolean };
}

export function IssueSidebar({
  sidebarOpen,
  mobileSidebarOpen,
  setMobileSidebarOpen,
  openSidebarClose,
  activeTab,
  setActiveTab,
  sortedGroups,
  collapsed,
  pinned,
  activeViewId,
  toggleCollapse,
  togglePin,
  selectView,
  savedViews,
  savedViewsLoading,
  selectSavedView,
  deleteSavedView,
  deleteSavedViewMutation,
  renamingId,
  setRenamingId,
  renameName,
  setRenameName,
  renameError,
  setRenameError,
  commitRename,
  renameSavedViewMutation,
}: Props) {
  return (
    <>
      {/* Mobile drawer backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed top-14 bottom-0 inset-x-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <aside className={cn(
        "bg-background border-r flex flex-col shrink-0 overflow-hidden",
        "fixed top-14 bottom-0 left-0 z-40 w-72 shadow-xl transition-transform duration-200 ease-in-out",
        mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
        "lg:relative lg:inset-y-auto lg:left-auto lg:z-auto lg:w-auto lg:shadow-none lg:translate-x-0 lg:transition-[width] lg:duration-200",
        sidebarOpen ? "lg:w-56" : "lg:w-0 lg:border-r-0",
      )}>
        {/* Tab header */}
        <div className="flex border-b shrink-0 min-w-56">
          <button
            onClick={() => setActiveTab("default")}
            className={cn(
              "flex-1 py-2.5 text-xs font-medium transition-colors",
              activeTab === "default"
                ? "text-primary border-b-2 border-primary bg-background/60"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Default lists
          </button>
          <button
            onClick={() => setActiveTab("my")}
            className={cn(
              "flex-1 py-2.5 text-xs font-medium transition-colors",
              activeTab === "my"
                ? "text-primary border-b-2 border-primary bg-background/60"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            My lists
          </button>
          <button
            onClick={openSidebarClose}
            className="px-2.5 text-muted-foreground hover:text-foreground transition-colors"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="size-3.5" />
          </button>
        </div>

        {/* Default nav */}
        {activeTab === "default" ? (
          <nav className="flex-1 overflow-y-auto py-2">
            {sortedGroups.map((group, idx) => {
              const isCollapsed   = collapsed.has(group.label);
              const isPinned      = pinned.has(group.label);
              const firstUnpinned = idx > 0 && !isPinned && pinned.has(sortedGroups[idx - 1].label);
              return (
                <div key={group.label} className="mb-1">
                  {firstUnpinned && <div className="mx-3 mb-1 border-t border-dashed border-border/60" />}
                  <div className="group/grp flex items-center">
                    <button
                      onClick={() => toggleCollapse(group.label)}
                      className="flex flex-1 items-center gap-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors min-w-0"
                    >
                      {isCollapsed
                        ? <ChevronRight className="size-3 shrink-0" />
                        : <ChevronDown  className="size-3 shrink-0" />
                      }
                      <span className="truncate">{group.label}</span>
                    </button>
                    <button
                      onClick={() => togglePin(group.label)}
                      title={isPinned ? "Unpin group" : "Pin to top"}
                      className={cn(
                        "mr-2 p-0.5 rounded transition-colors",
                        isPinned
                          ? "text-primary"
                          : "text-transparent group-hover/grp:text-muted-foreground hover:text-foreground!",
                      )}
                    >
                      <Pin className={cn("size-3", isPinned && "fill-current")} />
                    </button>
                  </div>
                  {!isCollapsed && group.items.map(item => (
                    <button
                      key={item.id}
                      onClick={() => selectView(item)}
                      className={cn(
                        "flex w-full items-center pl-6 pr-3 py-1.5 text-sm transition-colors text-left",
                        activeViewId === item.id
                          ? "bg-primary/90 text-primary-foreground font-medium"
                          : "text-foreground/80 hover:bg-primary/10 hover:text-primary",
                      )}
                    >
                      <span className="truncate">{item.label}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>
        ) : (
          /* Saved views nav */
          <nav className="flex-1 overflow-y-auto py-2">
            {savedViewsLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : savedViews.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                No saved views yet.<br />Use "Save view" in the toolbar.
              </p>
            ) : (
              savedViews.map(view => (
                <div
                  key={view.id}
                  className={cn(
                    "group/sv flex w-full items-center pl-4 pr-2 py-1.5 transition-colors",
                    activeViewId === `sv:${view.id}`
                      ? "bg-primary/90 text-primary-foreground"
                      : "text-foreground/80 hover:bg-primary/10 hover:text-primary",
                  )}
                >
                  {renamingId === view.id ? (
                    <div className="flex flex-1 flex-col min-w-0 py-0.5 pr-1">
                      <input
                        autoFocus
                        value={renameName}
                        onChange={e => { setRenameName(e.target.value); setRenameError(""); }}
                        onKeyDown={e => {
                          if (e.key === "Enter")  commitRename(view.id);
                          if (e.key === "Escape") { setRenamingId(null); setRenameError(""); }
                        }}
                        onBlur={() => { if (!renameSavedViewMutation.isPending) { setRenamingId(null); setRenameError(""); } }}
                        className="w-full rounded-sm bg-background text-foreground border border-primary text-sm outline-none px-1.5 py-0.5"
                      />
                      {renameError && (
                        <span className="text-[10px] text-destructive mt-0.5">{renameError}</span>
                      )}
                    </div>
                  ) : (
                    <>
                      <button
                        className="flex-1 text-sm text-left truncate"
                        onClick={() => selectSavedView(view)}
                      >
                        {view.name}
                      </button>
                      <button
                        title="Rename view"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => { setRenamingId(view.id); setRenameName(view.name); setRenameError(""); }}
                        className={cn(
                          "shrink-0 p-0.5 rounded transition-colors",
                          activeViewId === `sv:${view.id}`
                            ? "text-primary-foreground/60 hover:text-primary-foreground"
                            : "text-transparent group-hover/sv:text-muted-foreground hover:text-foreground!",
                        )}
                      >
                        <Pencil className="size-3" />
                      </button>
                      <ConfirmDialog
                        trigger={
                          <button
                            title="Delete view"
                            className={cn(
                              "shrink-0 p-0.5 rounded transition-colors",
                              activeViewId === `sv:${view.id}`
                                ? "text-primary-foreground/60 hover:text-primary-foreground"
                                : "text-transparent group-hover/sv:text-muted-foreground hover:text-destructive!",
                            )}
                          >
                            <Trash2 className="size-3" />
                          </button>
                        }
                        title="Remove saved view?"
                        description={`"${view.name}" will be permanently removed from your saved views.`}
                        confirmLabel="Remove"
                        variant="destructive"
                        isPending={deleteSavedViewMutation.isPending}
                        onConfirm={() => deleteSavedView(view.id)}
                      />
                    </>
                  )}
                </div>
              ))
            )}
          </nav>
        )}
      </aside>
    </>
  );
}
