import { useEffect, useRef } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export interface ColumnDef<T> {
  key: string;
  header: string;
  className?: string;
  /** If set the column header becomes clickable for sorting */
  sortKey?: string;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[] | undefined;
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  emptyMessage?: string;
  /**
   * "card" — bordered, rounded, self-scrolling (default, used in HomePage)
   * "page" — no wrapper, fills parent scroll container (used in full-page tables)
   */
  variant?: "card" | "page";
  maxHeight?: number;
  /** Extra classes applied to the <table> element, e.g. "min-w-190" */
  tableClassName?: string;
  /** When provided, renders group header rows between groups */
  groupedData?: Record<string, T[]> | null;
  /** Active sort field key */
  sortField?: string;
  /** Active sort direction */
  sortDir?: "asc" | "desc";
  /** Called with the column's sortKey when a sortable header is clicked */
  onSort?: (sortKey: string) => void;
  /** Infinite scroll — called when the user scrolls near the bottom */
  onLoadMore?: () => void;
  /** Set to true while the next page is loading */
  isFetchingMore?: boolean;
  /** Set to false to stop observing (no more pages) */
  hasMore?: boolean;
}

export function DataTable<T>({
  columns,
  data,
  onRowClick,
  isLoading = false,
  emptyMessage = "No items found.",
  variant = "card",
  maxHeight = 410,
  tableClassName = "",
  groupedData,
  sortField,
  sortDir,
  onSort,
  onLoadMore,
  isFetchingMore = false,
  hasMore = false,
}: DataTableProps<T>) {
  const clickClass       = onRowClick ? "cursor-pointer hover:bg-muted/40" : "";
  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const mobileScrollRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onLoadMore || !hasMore) return;

    function attachListener(container: HTMLDivElement | null) {
      if (!container) return () => {};
      const onScroll = () => {
        const { scrollTop, scrollHeight, clientHeight } = container;
        if (scrollHeight - scrollTop - clientHeight < 120) onLoadMore!();
      };
      container.addEventListener("scroll", onScroll, { passive: true });
      return () => container.removeEventListener("scroll", onScroll);
    }

    const cleanupDesktop = attachListener(desktopScrollRef.current);
    const cleanupMobile  = attachListener(mobileScrollRef.current);
    return () => { cleanupDesktop(); cleanupMobile(); };
  }, [onLoadMore, hasMore]);

  const infiniteFooter = onLoadMore ? (
    isFetchingMore ? (
      <div className="flex items-center justify-center py-3 border-t">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    ) : null
  ) : null;

  function cellValue(row: T, col: ColumnDef<T>) {
    return col.render
      ? col.render(row)
      : String((row as Record<string, unknown>)[col.key] ?? "");
  }

  function SortIcon({ sortKey }: { sortKey: string }) {
    if (sortField !== sortKey) return <ArrowUpDown className="size-3 opacity-20 ml-1 shrink-0" />;
    return sortDir === "asc"
      ? <ArrowUp   className="size-3 text-primary ml-1 shrink-0" />
      : <ArrowDown className="size-3 text-primary ml-1 shrink-0" />;
  }

  function renderRows(rows: T[]) {
    return rows.map((row, i) => (
      <tr
        key={i}
        onClick={() => onRowClick?.(row)}
        className={`border-b last:border-0 transition-colors ${clickClass}`}
      >
        {columns.map((col) => (
          <td key={col.key} className={`px-4 py-2.5 ${col.className ?? ""}`}>
            {cellValue(row, col)}
          </td>
        ))}
      </tr>
    ));
  }

  const tableContent = (
    <table className={`w-full text-sm border-collapse ${tableClassName}`}>
      <thead className="sticky top-0 z-10">
        <tr className="border-b bg-muted/50 backdrop-blur-sm">
          {columns.map((col) => (
            <th
              key={col.key}
              className={`px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap ${col.className ?? ""} ${col.sortKey && onSort ? "cursor-pointer select-none hover:text-foreground" : ""}`}
              onClick={() => col.sortKey && onSort?.(col.sortKey)}
            >
              {col.sortKey && onSort ? (
                <span className="inline-flex items-center">
                  {col.header}
                  <SortIcon sortKey={col.sortKey} />
                </span>
              ) : col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-b">
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-2.5">
                  <Skeleton className="h-4 w-full" />
                </td>
              ))}
            </tr>
          ))
        ) : groupedData ? (
          Object.entries(groupedData).flatMap(([gk, rows]) => [
            <tr key={`g-${gk}`} className="border-b bg-muted/30">
              <td colSpan={columns.length} className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {gk}
                <span className="ml-1.5 font-normal normal-case opacity-70">({rows.length})</span>
              </td>
            </tr>,
            ...renderRows(rows),
          ])
        ) : !data || data.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="py-16 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </td>
          </tr>
        ) : (
          renderRows(data)
        )}
      </tbody>
    </table>
  );

  function renderCards(rows: T[]) {
    return rows.map((row, i) => (
      <div
        key={i}
        onClick={() => onRowClick?.(row)}
        className={`p-4 transition-colors ${clickClass}`}
      >
        {columns.map((col) => (
          <div key={col.key} className="flex items-start justify-between gap-4 py-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap shrink-0">
              {col.header}
            </span>
            <span className="text-sm text-right min-w-0 wrap-break-word">
              {cellValue(row, col)}
            </span>
          </div>
        ))}
      </div>
    ));
  }

  const mobileContent = (
    <div className={variant === "card" ? "divide-y" : "divide-y border-t"}>
      {isLoading ? (
        Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-4 space-y-2">
            {columns.slice(0, 4).map((col) => (
              <div key={col.key} className="flex items-center justify-between gap-4">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-28" />
              </div>
            ))}
          </div>
        ))
      ) : groupedData ? (
        Object.entries(groupedData).flatMap(([gk, rows]) => [
          <div key={`g-${gk}`} className="px-4 py-2 bg-muted/30 border-b">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {gk} <span className="font-normal normal-case opacity-70">({rows.length})</span>
            </span>
          </div>,
          ...renderCards(rows),
        ])
      ) : !data || data.length === 0 ? (
        <div className="px-4 py-16 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        renderCards(data)
      )}
    </div>
  );

  if (variant === "page") {
    return (
      <>
        <div className="hidden md:block">{tableContent}{infiniteFooter}</div>
        <div className="md:hidden">{mobileContent}{infiniteFooter}</div>
      </>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <div ref={desktopScrollRef} className="hidden md:block overflow-y-auto" style={{ maxHeight }}>
        {tableContent}{infiniteFooter}
      </div>
      <div ref={mobileScrollRef} className="md:hidden overflow-y-auto" style={{ maxHeight }}>
        {mobileContent}{infiniteFooter}
      </div>
    </div>
  );
}
