import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export function SortIcon({
  sortKey,
  sortField,
  sortDir,
}: {
  sortKey: string;
  sortField?: string;
  sortDir?: "asc" | "desc";
}) {
  if (sortField !== sortKey)
    return <ArrowUpDown className="size-3 opacity-20 ml-1 shrink-0" />;
  return sortDir === "asc" ? (
    <ArrowUp className="size-3 text-primary ml-1 shrink-0" />
  ) : (
    <ArrowDown className="size-3 text-primary ml-1 shrink-0" />
  );
}
