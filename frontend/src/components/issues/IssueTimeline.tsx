import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import type { IssueDetail } from "@/types/issues";

type TLKind = "comment" | "internal" | "status" | "field";

interface TLEvent {
  id: string;
  time: number;
  kind: TLKind;
  actor: string;
  label: string;
  detail: string;
}

const KIND_COLOR: Record<TLKind, string> = {
  comment: "bg-blue-500",
  internal: "bg-amber-500",
  status: "bg-violet-500",
  field: "bg-slate-400",
};

const KIND_LABEL: Record<TLKind, string> = {
  comment: "Comment",
  internal: "Internal note",
  status: "Status change",
  field: "Field change",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function tlTickLabel(ts: number): string {
  const d = new Date(ts);
  if (d.getDate() <= 2) return `${MON_NAMES[d.getMonth()]} ${d.getDate()}`;
  return `${d.getDate()} ${DAY_NAMES[d.getDay()]}`;
}

export function IssueTimeline({ issue }: { issue: IssueDetail }) {
  const [open, setOpen] = useState(true);
  const [showDetails, setDetails] = useState(false);

  const start = new Date(issue.createdAt).getTime();
  const end = issue.resolvedAt
    ? new Date(issue.resolvedAt).getTime()
    : issue.closedAt
      ? new Date(issue.closedAt).getTime()
      : Date.now();
  const isLive = !issue.resolvedAt && !issue.closedAt;

  const PAD = 2 * 86_400_000;
  const axisStart = start - PAD;
  const axisEnd = end + PAD;
  const axisSpan = Math.max(axisEnd - axisStart, 1);

  const trackLeftPct = ((start - axisStart) / axisSpan) * 100;
  const trackRightPct = ((end - axisStart) / axisSpan) * 100;

  const events: TLEvent[] = [
    ...issue.comments.map((c) => ({
      id: c.id,
      time: new Date(c.createdAt).getTime(),
      kind: (c.isInternal ? "internal" : "comment") as TLKind,
      actor: c.user.fullName,
      label: c.isInternal ? "Internal note" : "Comment",
      detail: c.body.length > 60 ? c.body.slice(0, 60) + "…" : c.body,
    })),
    ...issue.activities.map((a) => ({
      id: a.id,
      time: new Date(a.createdAt).getTime(),
      kind: (a.fieldName === "status" ? "status" : "field") as TLKind,
      actor: a.user.fullName,
      label:
        a.fieldName === "status"
          ? `Status → ${a.newValue}`
          : `${a.fieldName.replace(/_/g, " ")} changed`,
      detail:
        a.oldValue && a.newValue
          ? `"${a.oldValue}" → "${a.newValue}"`
          : (a.newValue ?? ""),
    })),
  ].sort((a, b) => a.time - b.time);

  const clusters: TLEvent[][] = [];
  for (const ev of events) {
    const evPct = ((ev.time - axisStart) / axisSpan) * 100;
    const last = clusters.at(-1);
    const lastPct = last ? ((last[0].time - axisStart) / axisSpan) * 100 : -999;
    if (last && evPct - lastPct < 2.5) last.push(ev);
    else clusters.push([ev]);
  }

  const TICKS = 9;
  const ticks = Array.from({ length: TICKS }, (_, i) => ({
    pct: (i / (TICKS - 1)) * 100,
    label: tlTickLabel(axisStart + (axisSpan / (TICKS - 1)) * i),
  }));

  const presentKinds = (
    ["comment", "internal", "status", "field"] as TLKind[]
  ).filter((k) => events.some((e) => e.kind === k));

  return (
    <div className="border rounded-lg">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 hover:bg-muted/40 transition-colors rounded-t-lg"
      >
        <span className="text-sm font-medium">Timeline</span>
        <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-blue-400 inline-block" />
            {issue.comments.length} comments
          </span>
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-violet-400 inline-block" />
            {issue.activities.length} events
          </span>
          {isLive && (
            <span className="px-1.5 py-0.5 rounded border border-border bg-background font-medium text-[10px]">
              Now
            </span>
          )}
          {open ? (
            <ChevronDown className="size-3.5 ml-1" />
          ) : (
            <ChevronRight className="size-3.5 ml-1" />
          )}
        </div>
      </button>

      {open && (
        <div className="px-6 pt-4 pb-3">
          {/* Pins row */}
          <div className="relative h-8">
            {clusters.map((cluster, i) => {
              const pct = ((cluster[0].time - axisStart) / axisSpan) * 100;
              const primary = cluster[0].kind;
              const flipLeft = pct > 75;
              const flipRight = pct < 25;

              return (
                <div
                  key={i}
                  className="absolute bottom-0 -translate-x-1/2 flex flex-col items-center group z-20 cursor-default"
                  style={{ left: `${pct}%` }}
                >
                  <div className="flex items-center justify-center rounded-sm border border-border bg-background shadow-sm h-4.5 min-w-4.5 px-1 text-[9px] font-semibold text-muted-foreground">
                    {cluster.length > 1 ? (
                      cluster.length
                    ) : (
                      <span
                        className={cn(
                          "size-1.5 rounded-full shrink-0",
                          KIND_COLOR[primary],
                        )}
                      />
                    )}
                  </div>
                  <div className="w-px h-1.5 bg-border" />

                  <div
                    className={cn(
                      "absolute top-full mt-2 hidden group-hover:block z-30",
                      "w-52 rounded-lg border border-border bg-popover shadow-xl p-2.5",
                      flipLeft
                        ? "right-0"
                        : flipRight
                          ? "left-0"
                          : "left-1/2 -translate-x-1/2",
                    )}
                  >
                    <div className="space-y-2">
                      {cluster.map((ev) => (
                        <div
                          key={ev.id}
                          className="text-xs border-b border-border/50 last:border-0 pb-2 last:pb-0"
                        >
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span
                              className={cn(
                                "size-1.5 rounded-full shrink-0",
                                KIND_COLOR[ev.kind],
                              )}
                            />
                            <span className="font-medium">{ev.label}</span>
                          </div>
                          <p className="text-muted-foreground pl-3">
                            {ev.actor}
                          </p>
                          {ev.detail && (
                            <p className="text-muted-foreground/80 pl-3 truncate">
                              {ev.detail}
                            </p>
                          )}
                          <p className="text-muted-foreground/60 pl-3 mt-0.5">
                            {fmtDateTime(new Date(ev.time).toISOString())}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Track */}
          <div className="relative h-2.5 rounded-full bg-muted">
            <div
              className="absolute top-0 bottom-0 rounded-full"
              style={{
                left: `${trackLeftPct}%`,
                right: `${100 - trackRightPct}%`,
                backgroundColor: "var(--brand-green)",
              }}
            >
              <div
                title="Created"
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 size-3.5 rounded-full border-2 border-background shadow z-10"
                style={{ backgroundColor: "var(--brand-green)" }}
              />
              <div
                title={
                  issue.resolvedAt
                    ? "Resolved"
                    : issue.closedAt
                      ? "Closed"
                      : "Now"
                }
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 size-3.5 rounded-full border-2 border-background shadow z-10 bg-muted-foreground/50"
              />
            </div>
          </div>

          {/* Date axis */}
          <div className="relative h-5 mt-1.5 select-none">
            {ticks.map((tick, i) => (
              <span
                key={i}
                className="absolute text-[10px] text-muted-foreground whitespace-nowrap"
                style={{
                  left: `${tick.pct}%`,
                  transform:
                    i === 0
                      ? "none"
                      : i === TICKS - 1
                        ? "translateX(-100%)"
                        : "translateX(-50%)",
                }}
              >
                {tick.label}
              </span>
            ))}
            {isLive && (
              <span
                className="absolute text-[10px] font-semibold whitespace-nowrap"
                style={{
                  left: `${trackRightPct}%`,
                  transform:
                    trackRightPct > 75
                      ? "translateX(-100%)"
                      : trackRightPct < 25
                        ? "none"
                        : "translateX(-50%)",
                  color: "var(--brand-green)",
                }}
              >
                Now
              </span>
            )}
          </div>

          {presentKinds.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setDetails((d) => !d)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showDetails ? (
                  <ChevronDown className="size-3" />
                ) : (
                  <ChevronRight className="size-3" />
                )}
                Show Details
              </button>
              {showDetails && (
                <div className="flex items-center gap-4 mt-2 pt-2 border-t">
                  {presentKinds.map((k) => (
                    <span
                      key={k}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground"
                    >
                      <span
                        className={cn("size-2 rounded-full", KIND_COLOR[k])}
                      />
                      {KIND_LABEL[k]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
