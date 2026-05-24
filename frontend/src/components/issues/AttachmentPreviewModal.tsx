import { Paperclip, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function previewKind(mimeType: string): "image" | "download" {
  if (mimeType.startsWith("image/")) return "image";
  return "download";
}

interface AttachmentPreviewModalProps {
  open: boolean;
  onClose: () => void;
  filename: string;
  mimeType: string;
  sizeBytes: string;
  previewUrl: string;
}

export function AttachmentPreviewModal({
  open, onClose, filename, mimeType, sizeBytes, previewUrl,
}: AttachmentPreviewModalProps) {
  const kind   = previewKind(mimeType);
  const sizeKb = Math.round(Number(sizeBytes) / 1024);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={cn(
        "flex flex-col gap-0 p-0 overflow-hidden",
        kind === "image" ? "max-w-3xl" : "max-w-lg",
      )}>
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="text-sm font-medium flex items-center gap-2">
            <Paperclip className="size-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{filename}</span>
            <span className="text-xs text-muted-foreground font-normal shrink-0">
              {sizeKb > 0 ? `${sizeKb} KB` : "< 1 KB"}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {kind === "image" && (
            <img
              src={previewUrl}
              alt={filename}
              className="w-full h-auto object-contain max-h-[75vh]"
            />
          )}
          {kind === "download" && (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-muted-foreground">
              <Download className="size-10 opacity-30" />
              <p className="text-sm">Preview not available for this file type.</p>
              <a
                href={previewUrl}
                download={filename}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors text-foreground"
              >
                <Download className="size-4" />
                Download file
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
