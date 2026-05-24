import { useState } from "react";
import { Paperclip, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDateTime, relTime } from "@/lib/format";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";
import type { FeedItem } from "@/types/issues";

type FeedAttachment = Extract<FeedItem, { kind: "attachment" }>;

interface AttachmentRowProps {
  item: FeedAttachment;
  isSelf: boolean;
  issueId: string;
}

export function AttachmentRow({ item, isSelf, issueId }: AttachmentRowProps) {
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const ts = new Date(item.createdAt).getTime();
  const sizeKb = Math.round(Number(item.sizeBytes) / 1024);

  const openPreview = async () => {
    setLoading(true);
    try {
      const { getDownloadUrl } = await import("@/api/issues");
      const { downloadUrl } = await getDownloadUrl(issueId, item.id);
      setPreviewUrl(downloadUrl);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className={cn("flex gap-2 items-start", isSelf && "justify-end")}>
        <div
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full bg-muted/60 mt-0.5",
            isSelf && "order-last",
          )}
        >
          <Paperclip className="size-3 text-muted-foreground" />
        </div>
        <div
          className={cn("min-w-0 py-0.5 max-w-[78%]", isSelf && "text-right")}
        >
          <div
            className={cn(
              "flex items-center gap-1.5 flex-wrap text-sm leading-snug",
              isSelf && "justify-end",
            )}
          >
            <span className="font-medium">{item.user.fullName}</span>
            <span className="text-muted-foreground">attached</span>
            <button
              onClick={openPreview}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] bg-muted border font-medium max-w-48 hover:bg-muted/70 transition-colors disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="size-2.5 shrink-0 animate-spin" />
              ) : (
                <Paperclip className="size-2.5 shrink-0" />
              )}
              <span className="truncate">{item.filename}</span>
            </button>
            <span className="text-[10px] text-muted-foreground">
              {sizeKb > 0 ? `${sizeKb} KB` : "< 1 KB"}
            </span>
          </div>
          <p
            className="text-[10px] text-muted-foreground/60 mt-0.5"
            title={fmtDateTime(item.createdAt)}
          >
            {relTime(ts)}
          </p>
        </div>
      </div>

      {previewUrl && (
        <AttachmentPreviewModal
          open={open}
          onClose={() => setOpen(false)}
          filename={item.filename}
          mimeType={item.mimeType}
          sizeBytes={item.sizeBytes}
          previewUrl={previewUrl}
        />
      )}
    </>
  );
}
