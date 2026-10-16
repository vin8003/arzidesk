import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Button } from "@/components/ui/button";

/** Asks before something that cannot be undone. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  text,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  text?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog">
          <AlertDialog.Title className="dialog-title">{title}</AlertDialog.Title>
          {text ? <AlertDialog.Description className="dialog-text">{text}</AlertDialog.Description> : null}
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" disabled={busy}>
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            <Button
              variant={danger ? "danger" : "primary"}
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
