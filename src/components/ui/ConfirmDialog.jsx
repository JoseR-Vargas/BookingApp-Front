import { Dialog, DialogBackdrop, DialogDescription, DialogPanel, DialogTitle } from '@headlessui/react';
import Button from './Button.jsx';

const noop = () => {};

/**
 * In-app replacement for `window.confirm`, built on the Headless UI Dialog (focus trap, scroll lock,
 * inert siblings, Escape, `aria-labelledby`/`aria-describedby`). The look is the Preline modal
 * (`overlay` tokens, mapped to the dark/gold palette in index.css); `Modal.jsx` is not reused because
 * it carries the legacy booking-modal chrome and a static backdrop, and this dialog must be dismissed
 * by a backdrop click.
 *
 *  - `variant="danger"` paints the confirm button with the error color (destructive actions);
 *  - Cancel gets the initial focus so Enter/Space never trigger the destructive action by accident;
 *  - `busy` freezes the dialog while the confirmed action is in flight: both buttons are disabled and
 *    Escape / backdrop clicks are ignored, so the action cannot be submitted (or abandoned) twice.
 *
 * The parent owns `open`: `onConfirm` and `onCancel` only report the choice.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  busy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Dialog
      transition
      open={open}
      role="alertdialog"
      onClose={busy ? noop : onCancel}
      className="group relative z-1055 transition-opacity duration-150 ease-linear data-closed:opacity-0"
    >
      <DialogBackdrop className="fixed inset-0 bg-black/50" />
      {/* Everything around the panel lands here: a click on it is an "outside click" for the Dialog. */}
      <div
        data-testid="confirm-dialog-backdrop"
        className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4"
      >
        <DialogPanel className="w-full max-w-md rounded-xl border border-overlay-line bg-overlay text-foreground shadow-xl transition-transform duration-300 ease-out group-data-closed:-translate-y-6">
          <div className="border-b border-overlay-header px-4 py-3">
            <DialogTitle as="h3" className="font-bold text-foreground">{title}</DialogTitle>
          </div>
          <DialogDescription as="div" className="p-4 text-sm text-muted-foreground-1">
            {message}
          </DialogDescription>
          <div className="flex items-center justify-end gap-x-2 border-t border-overlay-footer px-4 py-3">
            <Button variant="outline" size="xs" data-autofocus disabled={busy} onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button variant={variant === 'danger' ? 'danger' : 'primary'} size="xs" disabled={busy} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
