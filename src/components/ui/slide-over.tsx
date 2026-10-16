import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A panel that slides in over the page (a bottom sheet on a phone). Used for
 * focused tasks that keep the page underneath in view: opening a record,
 * starting a matter, filing research to a case. Built on Radix Dialog for
 * focus trapping, Escape, and scroll locking.
 */
export function SlideOver({
  open,
  onClose,
  title,
  kicker,
  description,
  closeLabel,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  kicker?: ReactNode;
  description?: ReactNode;
  closeLabel: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="slide-overlay" />
        <Dialog.Content className="slide-panel" {...(description ? {} : { "aria-describedby": undefined })}>
          <div className="sheet-head">
            <div className="sheet-head-text">
              {kicker ? <p className="sheet-kicker">{kicker}</p> : null}
              <Dialog.Title className="sheet-title">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-1 text-sm text-muted">{description}</Dialog.Description> : null}
            </div>
            <Dialog.Close className="icon-btn" aria-label={closeLabel}>
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </div>
          <div className="sheet-body">{children}</div>
          {footer ? <div className="sheet-foot">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
