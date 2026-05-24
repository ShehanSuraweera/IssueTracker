import { Download, Menu, PanelLeftOpen, Plus, RefreshCw } from "lucide-react";
import { relativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import type { UserRole } from "@/types/auth";

interface Props {
  sidebarOpen: boolean;
  openSidebarOpen: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  activeViewLabel: string;
  totalCount: number;
  dataUpdatedAt: number;
  isFetching: boolean;
  refetch: () => void;
  isExporting: boolean;
  handleExport: (format: "csv" | "json") => void;
  hasRole: (...roles: UserRole[]) => boolean;
  onNew: () => void;
}

export function IssueHeader({
  sidebarOpen,
  openSidebarOpen,
  setMobileSidebarOpen,
  activeViewLabel,
  totalCount,
  dataUpdatedAt,
  isFetching,
  refetch,
  isExporting,
  handleExport,
  hasRole,
  onNew,
}: Props) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b bg-background shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          className="lg:hidden text-muted-foreground hover:text-foreground transition-colors shrink-0"
          onClick={() => setMobileSidebarOpen(true)}
          title="Open navigation"
        >
          <Menu className="size-4" />
        </button>
        {!sidebarOpen && (
          <button
            onClick={openSidebarOpen}
            className="hidden lg:block text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Expand sidebar"
          >
            <PanelLeftOpen className="size-3.5" />
          </button>
        )}
        <h1 className="text-sm font-semibold truncate">
          Issues — <span className="hidden sm:inline">{activeViewLabel}</span>
          <span className="sm:hidden">{totalCount > 0 ? totalCount : ""}</span>
        </h1>
        {totalCount > 0 && (
          <span className="hidden sm:inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
            {totalCount}
          </span>
        )}
        {dataUpdatedAt > 0 && (
          <span className="text-xs text-muted-foreground hidden md:block whitespace-nowrap">
            Last refreshed {relativeTime(dataUpdatedAt)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={refetch}
          title="Refresh"
        >
          <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs" disabled={isExporting}>
              <Download className={cn("size-3.5", isExporting && "animate-pulse", "sm:mr-1.5")} />
              <span className="hidden sm:inline">{isExporting ? "Exporting…" : "Export"}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuLabel className="text-xs py-1.5">Export as</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs" onClick={() => handleExport("csv")}>
              CSV — spreadsheet
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs" onClick={() => handleExport("json")}>
              JSON — structured
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {!hasRole("engineer") && (
          <Button size="sm" className="h-8 text-xs" onClick={onNew}>
            <Plus className="size-3.5 sm:mr-1" />
            <span className="hidden sm:inline">New</span>
          </Button>
        )}
      </div>
    </div>
  );
}
