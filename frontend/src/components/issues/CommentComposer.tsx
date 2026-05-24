import { useState, useRef } from "react";
import { Send, Loader2, Lock, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtBytes } from "@/lib/format";
import { useAddComment, useUploadAttachments } from "@/hooks/use-issues";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_FILES = 5;

interface CommentComposerProps {
  issueId: string;
  canInternal: boolean;
  borderColor: string;
}

export function CommentComposer({
  issueId,
  canInternal,
  borderColor,
}: CommentComposerProps) {
  const [body, setBody] = useState("");
  const [isInternal, setInternal] = useState(false);
  const [pendingFiles, setFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const commentMutation = useAddComment(issueId);
  const uploadMutation = useUploadAttachments(issueId);
  const isPending = commentMutation.isPending || uploadMutation.isPending;

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setUploadError(null);
    const oversized: string[] = [];
    const valid = Array.from(list).filter((f) => {
      if (f.size > MAX_FILE_SIZE) {
        oversized.push(f.name);
        return false;
      }
      return true;
    });
    if (oversized.length)
      setUploadError(
        `${oversized.map((n) => `"${n}"`).join(", ")} exceeds the 25 MB limit.`,
      );
    setFiles((prev) => [...prev, ...valid].slice(0, MAX_FILES));
  };

  const removeFile = (idx: number) =>
    setFiles((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!body.trim() && pendingFiles.length === 0) return;
    setUploadError(null);
    try {
      if (pendingFiles.length > 0)
        await uploadMutation.mutateAsync(pendingFiles);
      if (body.trim()) await commentMutation.mutateAsync({ body, isInternal });
      setBody("");
      setInternal(false);
      setFiles([]);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      setUploadError(
        status === 503
          ? "File storage is not configured on this server."
          : "Something went wrong. Please try again.",
      );
    }
  };

  return (
    <div
      className="shrink-0 px-4 py-3 border-b bg-background/60 backdrop-blur-sm"
      style={{ borderColor }}
    >
      <p className="text-xs text-muted-foreground mb-2">
        {isInternal
          ? "Internal note — only visible to engineers and admins"
          : "Everyone can see this comment"}
      </p>

      <textarea
        className="w-full bg-transparent text-base sm:text-sm placeholder:text-muted-foreground focus-visible:outline-none resize-none min-h-16"
        placeholder="Write a comment…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
      />

      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1 pb-2">
          {pendingFiles.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-xs max-w-52"
            >
              <Paperclip className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{f.name}</span>
              <span className="text-muted-foreground shrink-0 ml-0.5">
                {fmtBytes(f.size)}
              </span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="ml-0.5 text-muted-foreground hover:text-foreground shrink-0"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {uploadError && (
        <p className="text-xs text-destructive pb-1">{uploadError}</p>
      )}

      <div className="flex items-center justify-between pt-2 border-t mt-1">
        {canInternal ? (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isInternal}
              onChange={(e) => setInternal(e.target.checked)}
              className="rounded"
            />
            <Lock className="size-3" /> Internal note
          </label>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending || pendingFiles.length >= MAX_FILES}
            title={
              pendingFiles.length >= MAX_FILES
                ? `Max ${MAX_FILES} files`
                : "Attach files"
            }
            className={cn(
              "p-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
              pendingFiles.length > 0
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            <Paperclip className="size-4" />
          </button>
          <Button
            size="sm"
            disabled={(!body.trim() && pendingFiles.length === 0) || isPending}
            onClick={() => void submit()}
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin mr-1.5" />
            ) : (
              <Send className="size-4 mr-1.5" />
            )}
            {uploadMutation.isPending ? "Uploading…" : "Post"}
          </Button>
        </div>
      </div>
    </div>
  );
}
