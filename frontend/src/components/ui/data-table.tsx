import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SortIcon } from "@/components/ui/sort-icon";

export interface ColumnDef<T> {
  key: string;
  header: string;
  className?: string;
  sortKey?: string;
  render?: (row: T) => React.ReactNode;
  mobile?: {
    primary?: boolean;
    hidden?: boolean;
  };
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[] | undefined;
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  emptyMessage?: string;
  variant?: "card" | "page";
  maxHeight?: number;
  tableClassName?: string;
  groupedData?: Record<string, T[]> | null;
  sortField?: string;
  sortDir?: "asc" | "desc";
  onSort?: (sortKey: string) => void;
  onLoadMore?: () => void;
  isFetchingMore?: boolean;
  hasMore?: boolean;
  mobileRender?: (row: T) => React.ReactNode;
  rowKey?: (row: T) => string | number;
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
  mobileRender,
  rowKey,
}: DataTableProps<T>) {
  const getKey = (row: T, i: number) => (rowKey ? rowKey(row) : i);
  const clickClass = onRowClick ? "cursor-pointer hover:bg-muted/40" : "";
  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);

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
    const cleanupMobile = attachListener(mobileScrollRef.current);
    return () => {
      cleanupDesktop();
      cleanupMobile();
    };
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

  function renderRows(rows: T[]) {
    return rows.map((row, i) => (
      <tr
        key={getKey(row, i)}
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
                  <SortIcon
                    sortKey={col.sortKey}
                    sortField={sortField}
                    sortDir={sortDir}
                  />
                </span>
              ) : (
                col.header
              )}
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
        ) : groupedData && Object.keys(groupedData).length > 0 ? (
          Object.entries(groupedData).flatMap(([gk, rows]) => [
            <tr key={`g-${gk}`} className="border-b bg-muted/30">
              <td
                colSpan={columns.length}
                className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {gk}
                <span className="ml-1.5 font-normal normal-case opacity-70">
                  ({rows.length})
                </span>
              </td>
            </tr>,
            ...renderRows(rows),
          ])
        ) : !data || data.length === 0 ? (
          <tr>
            <td
              colSpan={columns.length}
              className="py-16 text-center text-sm text-muted-foreground"
            >
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
    if (mobileRender) {
      return rows.map((row, i) => (
        <div key={getKey(row, i)}>{mobileRender(row)}</div>
      ));
    }
    const primaryCols = columns.filter(
      (c) => c.mobile?.primary && !c.mobile?.hidden,
    );
    const secondaryCols = columns.filter(
      (c) => !c.mobile?.primary && !c.mobile?.hidden,
    );
    return rows.map((row, i) => (
      <div
        key={getKey(row, i)}
        onClick={() => onRowClick?.(row)}
        className={`px-4 py-3.5 border-b transition-colors ${clickClass}`}
      >
        {primaryCols.map((col) => (
          <div key={col.key} className="mb-2">
            {cellValue(row, col)}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {secondaryCols.map((col) => (
            <span key={col.key}>{cellValue(row, col)}</span>
          ))}
        </div>
      </div>
    ));
  }

  const mobileContent = (
    <div className={variant === "card" ? "divide-y" : "divide-y border-t"}>
      {isLoading ? (
        Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="px-4 py-3.5 border-b space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <div className="flex gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        ))
      ) : groupedData && Object.keys(groupedData).length > 0 ? (
        Object.entries(groupedData).flatMap(([gk, rows]) => [
          <div key={`g-${gk}`} className="px-4 py-2 bg-muted/30 border-b">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {gk}{" "}
              <span className="font-normal normal-case opacity-70">
                ({rows.length})
              </span>
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
        <div className="hidden md:block">
          {tableContent}
          {infiniteFooter}
        </div>
        <div className="md:hidden">
          {mobileContent}
          {infiniteFooter}
        </div>
      </>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <div
        ref={desktopScrollRef}
        className="hidden md:block overflow-y-auto"
        style={{ maxHeight }}
      >
        {tableContent}
        {infiniteFooter}
      </div>
      <div
        ref={mobileScrollRef}
        className="md:hidden overflow-y-auto"
        style={{ maxHeight }}
      >
        {mobileContent}
        {infiniteFooter}
      </div>
    </div>
  );
}
