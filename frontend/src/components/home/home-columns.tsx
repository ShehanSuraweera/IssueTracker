import { PriorityBadge } from "@/components/ui/priority-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ColumnDef } from "@/components/ui/data-table";
import type { IssueSummary } from "@/types/issues";

export function slaInfo(deadline: string | null): { label: string; breached: boolean } {
  if (!deadline) return { label: "—", breached: false };
  const rem = new Date(deadline).getTime() - Date.now();
  if (rem <= 0) return { label: "Breached", breached: true };
  const d = Math.floor(rem / 86_400_000);
  const h = Math.floor((rem % 86_400_000) / 3_600_000);
  return { label: d > 0 ? `${d}d ${h}h` : `${h}h`, breached: false };
}

export const homeColumns: ColumnDef<IssueSummary>[] = [
  {
    key: "ticketNumber",
    header: "Ticket",
    className: "whitespace-nowrap",
    render: (row) => <span className="font-mono text-xs text-muted-foreground">{row.ticketNumber}</span>,
  },
  {
    key: "title",
    header: "Title",
    className: "max-w-55",
    mobile: { primary: true },
    render: (row) => <span className="text-sm font-medium line-clamp-2">{row.title}</span>,
  },
  {
    key: "priority",
    header: "Priority",
    className: "whitespace-nowrap",
    render: (row) => <PriorityBadge priority={row.priority} />,
  },
  {
    key: "status",
    header: "State",
    className: "whitespace-nowrap",
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: "product",
    header: "Product",
    className: "whitespace-nowrap",
    render: (row) => <span className="text-xs text-muted-foreground">{row.product.name}</span>,
  },
  {
    key: "slaTimeLeft",
    header: "Actual time left",
    className: "whitespace-nowrap",
    render: (row) => {
      const sla = slaInfo(row.slaDeadline);
      return (
        <span className={sla.breached ? "text-xs text-red-600 font-medium" : "text-xs text-muted-foreground"}>
          {sla.label}
        </span>
      );
    },
  },
  {
    key: "slaBreached",
    header: "Has breached",
    className: "whitespace-nowrap",
    mobile: { hidden: true },
    render: (row) => {
      const sla = slaInfo(row.slaDeadline);
      return sla.breached
        ? <span className="text-xs text-red-600 font-medium">Yes</span>
        : <span className="text-xs text-muted-foreground">No</span>;
    },
  },
  {
    key: "createdAt",
    header: "Created",
    className: "whitespace-nowrap",
    mobile: { hidden: true },
    render: (row) => (
      <span className="text-xs text-muted-foreground">
        {new Date(row.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </span>
    ),
  },
  {
    key: "updatedAt",
    header: "Updated",
    className: "whitespace-nowrap",
    render: (row) => (
      <span className="text-xs text-muted-foreground">
        {new Date(row.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </span>
    ),
  },
];
