import type { ColumnDef } from "@/components/ui/data-table";
import type { IssueSummary } from "@/types/issues";
import { StatusBadge } from "@/components/ui/status-badge";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { ImpactBadge } from "@/components/ui/impact-badge";

export const ISSUE_COLS: ColumnDef<IssueSummary>[] = [
  {
    key: "ticketNumber",
    header: "Number",
    className: "w-32",
    sortKey: "ticketNumber",
    render: (row) => <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">{row.ticketNumber}</span>,
  },
  {
    key: "title",
    header: "Short description",
    className: "min-w-[220px]",
    sortKey: "title",
    mobile: { primary: true },
    render: (row) => <span className="text-sm font-medium line-clamp-2">{row.title}</span>,
  },
  {
    key: "type",
    header: "Type",
    className: "w-28",
    mobile: { hidden: true },
    render: (row) => <span className="text-xs text-muted-foreground capitalize whitespace-nowrap">{row.type.replace(/_/g, " ")}</span>,
  },
  {
    key: "product",
    header: "Product",
    className: "w-32",
    render: (row) => <span className="text-xs text-muted-foreground whitespace-nowrap">{row.product.name}</span>,
  },
  {
    key: "status",
    header: "State",
    className: "w-28",
    sortKey: "status",
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: "priority",
    header: "Priority",
    className: "w-24",
    sortKey: "priority",
    render: (row) => <PriorityBadge priority={row.priority} />,
  },
  {
    key: "impact",
    header: "Impact",
    className: "w-24",
    mobile: { hidden: true },
    render: (row) => <ImpactBadge impact={row.impact} />,
  },
  {
    key: "assignee",
    header: "Assigned to",
    className: "w-36",
    sortKey: "assignee",
    render: (row) => (
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {row.assignee?.fullName ?? <em className="not-italic opacity-40">Unassigned</em>}
      </span>
    ),
  },
  {
    key: "updatedAt",
    header: "Updated",
    className: "w-32",
    sortKey: "updatedAt",
    render: (row) => <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(row.updatedAt).toLocaleDateString()}</span>,
  },
];
