import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  /** The element that opens the dialog when clicked */
  trigger: React.ReactNode;
  title: string;
  description?: string;
  /** Label for the confirm button. Defaults to "Confirm" */
  confirmLabel?: string;
  /** Use "destructive" for delete/irreversible actions */
  variant?: "default" | "destructive";
  /** Whether the confirm action is in flight (shows spinner, disables buttons) */
  isPending?: boolean;
  onConfirm: () => void;
}

/**
 * Drop-in confirm dialog. Wrap any trigger element — the dialog open/close
 * state is managed internally, so the parent only needs to supply onConfirm.
 *
 * Example:
 *   <ConfirmDialog
 *     trigger={<Button>Mark Resolved</Button>}
 *     title="Mark as resolved?"
 *     description="This will notify the requester."
 *     confirmLabel="Yes, resolve"
 *     onConfirm={() => resolveMutation.mutate()}
 *     isPending={resolveMutation.isPending}
 *   />
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "default",
  isPending = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);

  function handleConfirm() {
    onConfirm();
    if (!isPending) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Wrap trigger in a span so any element works as a trigger */}
      <span onClick={() => setOpen(true)} style={{ display: "contents" }}>
        {trigger}
      </span>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            size="sm"
            variant={variant === "destructive" ? "destructive" : "default"}
            disabled={isPending}
            onClick={handleConfirm}
          >
            {isPending
              ? <><Loader2 className="mr-1.5 size-3.5 animate-spin" />{confirmLabel}</>
              : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
