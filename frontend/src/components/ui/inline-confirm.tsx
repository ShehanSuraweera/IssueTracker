import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InlineConfirmProps {
  trigger: React.ReactNode;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isPending?: boolean;
  onConfirm: () => void;
}

export function InlineConfirm({
  trigger,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isPending = false,
  onConfirm,
}: InlineConfirmProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <span onClick={() => setOpen(true)} style={{ display: "contents" }}>
        {trigger}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5">
      <span className="text-sm text-muted-foreground">{message}</span>
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => setOpen(false)}
      >
        {cancelLabel}
      </Button>
      <Button
        size="sm"
        disabled={isPending}
        onClick={() => {
          onConfirm();
          if (!isPending) setOpen(false);
        }}
      >
        {isPending
          ? <Loader2 className="size-3.5 animate-spin" />
          : confirmLabel}
      </Button>
    </div>
  );
}
