// Small building blocks shared by the three tabs of the "Configuración" section.

import Button from '../../ui/Button.jsx';
import { CONTROL_CLASSES, LABEL_CLASSES } from '../../ui/controls.js';
import Spinner from '../../ui/Spinner.jsx';

export const CONTROL = CONTROL_CLASSES;

export function ActiveBadge({ active }) {
  const look = active ? 'bg-success/15 text-success' : 'bg-bg-tertiary text-text-secondary';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${look}`}>
      {active ? 'Activo' : 'Inactivo'}
    </span>
  );
}

/** Label bound to its control through `htmlFor`/`id`. */
export function Field({ id, label, className = '', children }) {
  return (
    <div className={className}>
      <label htmlFor={id} className={LABEL_CLASSES}>{label}</label>
      {children}
    </div>
  );
}

/** Backend or validation message of a form. Renders nothing without a message. */
export function FormError({ message, testId }) {
  if (!message) return null;
  return (
    <p role="alert" data-testid={testId} className="mt-4 text-sm text-error">
      {message}
    </p>
  );
}

/** Submit button: disabled with a spinner while the request is in flight, or while `disabled`. */
export function SaveButton({ saving, disabled = false, testId, children }) {
  return (
    <Button type="submit" size="sm" disabled={saving || disabled} data-testid={testId}>
      {saving ? (
        <>
          <Spinner className="-my-0.5" barClassName="bg-primary-foreground" />
          Guardando...
        </>
      ) : (
        <>
          {children}
        </>
      )}
    </Button>
  );
}
