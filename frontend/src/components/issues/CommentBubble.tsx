import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDateTime, relTime } from "@/lib/format";
import type { Comment } from "@/types/issues";

export function CommentBubble({
  comment,
  isSelf,
}: {
  comment: Comment;
  isSelf: boolean;
}) {
  return (
    <div className={cn("flex items-end gap-2", isSelf && "flex-row-reverse")}>
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs">
        {comment.user.fullName.charAt(0).toUpperCase()}
      </div>
      <div
        className={cn(
          "flex flex-col min-w-0 max-w-[78%]",
          isSelf && "items-end",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-1.5 mb-1 flex-wrap",
            isSelf && "flex-row-reverse",
          )}
        >
          {!isSelf && (
            <>
              <span className="text-xs font-semibold">
                {comment.user.fullName}
              </span>
              <span className="text-[10px] text-muted-foreground capitalize">
                {comment.user.role.replace("_", " ")}
              </span>
            </>
          )}
          {comment.isInternal && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
              <Lock className="size-2.5" /> Internal
            </span>
          )}
          <span
            className="text-[10px] text-muted-foreground"
            title={fmtDateTime(comment.createdAt)}
          >
            {relTime(new Date(comment.createdAt).getTime())}
          </span>
        </div>
        <div
          className={cn(
            "px-3.5 py-2 text-sm whitespace-pre-wrap leading-relaxed border",
            isSelf ? "rounded-2xl rounded-br-sm" : "rounded-2xl rounded-bl-sm",
            comment.isInternal
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : isSelf
                ? "border-transparent"
                : "bg-background border-border",
          )}
          style={
            isSelf && !comment.isInternal
              ? {
                  background:
                    "color-mix(in srgb, var(--brand-green) 22%, var(--background))",
                  borderColor:
                    "color-mix(in srgb, var(--brand-green) 35%, transparent)",
                }
              : undefined
          }
        >
          {comment.body}
        </div>
      </div>
    </div>
  );
}
