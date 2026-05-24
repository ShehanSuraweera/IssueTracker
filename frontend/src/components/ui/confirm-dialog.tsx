import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  confirmLabel?: string;
  variant?: "default" | "destructive";
  isPending?: boolean;
  onConfirm: () => void;
}

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
            {isPending ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                {confirmLabel}
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
