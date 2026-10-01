import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSentimentTimeline } from "@/hooks/use-ai";
import { RISK_STYLE, SENTIMENT_STYLE } from "@/lib/ai-display";
import { fmtDateTime, relTime } from "@/lib/format";
import { AiCardMessage, AiTag, FrustrationMeter, Pill } from "./ai-bits";

/**
 * The client's mood across the thread: one reading for the issue and one per
 * client comment. Staff only, and never used to compute priority.
 */
export function ClientMoodCard({ issueId }: { issueId: string }) {
  const { data, isLoading, isError } = useSentimentTimeline(issueId, true);

  if (data && data.entries.length === 0) return null;

  const latest = data?.latest;
  const earlier = data ? data.entries.slice(0, -1).reverse().slice(0, 4) : [];

  return (
    <Card>
      <CardHeader className="px-4 pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          Client mood <AiTag />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        {isLoading && <Skeleton className="h-24 w-full" />}
        {isError && <AiCardMessage>Client mood is unavailable right now.</AiCardMessage>}

        {latest && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill className={SENTIMENT_STYLE[latest.sentiment].cls}>
                {SENTIMENT_STYLE[latest.sentiment].label}
              </Pill>
              <Pill className={RISK_STYLE[latest.escalationRisk].cls}>
                {RISK_STYLE[latest.escalationRisk].label}
              </Pill>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                Frustration <FrustrationMeter level={latest.frustrationLevel} />
              </span>
              <span title={fmtDateTime(latest.createdAt)}>
                {relTime(new Date(latest.createdAt).getTime())}
              </span>
            </div>
            <blockquote className="border-l-2 border-muted pl-2 text-xs italic text-foreground/80">
              “{latest.evidenceQuote}”
            </blockquote>
          </div>
        )}

        {data && data.entries.length >= 2 && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Frustration across the thread
            </p>
            <ResponsiveContainer width="100%" height={44}>
              <LineChart data={data.entries.map((e, i) => ({ i, level: e.frustrationLevel }))}>
                <YAxis domain={[1, 5]} hide />
                <Line
                  type="monotone"
                  dataKey="level"
                  stroke="#e11d48"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {earlier.length > 0 && (
          <ul className="space-y-1.5 border-t pt-2">
            {earlier.map((entry) => (
              <li key={entry.id} className="space-y-0.5">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>
                    {entry.source === "issue" ? "Original issue" : "Comment"} ·{" "}
                    {relTime(new Date(entry.createdAt).getTime())}
                  </span>
                  <FrustrationMeter level={entry.frustrationLevel} />
                </div>
                <p className="truncate text-[11px] italic text-foreground/70">“{entry.evidenceQuote}”</p>
              </li>
            ))}
          </ul>
        )}

        <p className="text-[10px] text-muted-foreground">
          Internal signal. Never shown to the client and never affects priority.
        </p>
      </CardContent>
    </Card>
  );
}
