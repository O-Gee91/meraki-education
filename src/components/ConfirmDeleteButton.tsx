import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function ConfirmDeleteButton({
  label = "Delete",
  title,
  description,
  onConfirm,
  disabled,
  warningTitle,
  warningDescription,
}: {
  label?: string;
  title: string;
  description?: string;
  onConfirm: () => void;
  disabled?: boolean;
  /** When provided, a warning dialog is shown first before the final confirmation. */
  warningTitle?: string;
  warningDescription?: string;
}) {
  const [open, setOpen] = useState(false);
  const [showWarning, setShowWarning] = useState(!!warningTitle);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setShowWarning(!!warningTitle);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled} className="text-destructive">
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        {showWarning ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{warningTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {warningDescription ?? "Please review before proceeding."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setOpen(false)}>Cancel</AlertDialogCancel>
              <Button onClick={() => setShowWarning(false)}>
                Continue
              </Button>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription>
                {description ?? "This cannot be undone."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setOpen(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onConfirm();
                  setOpen(false);
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
