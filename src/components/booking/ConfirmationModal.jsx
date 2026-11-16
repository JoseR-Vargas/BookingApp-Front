import { DialogTitle } from '@headlessui/react';
import { toast } from '../../ui/toast.js';
import { formatLongDateUTC, formatMoney } from '../../utils/format.js';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';

function Row({ label, children, last = false }) {
  return (
    <div className={`flex items-start text-[0.95rem] text-text-primary cq-compact:text-[0.85rem] cq-compact:leading-snug ${last ? '' : 'mb-2 cq-compact:mb-1'}`}>
      <span className="mr-1 text-text-secondary">{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Enlace copiado');
  } catch {
    // No clipboard API (insecure context, old browser) or the user denied it: the link is also on screen.
    toast.error('No se pudo copiar el enlace. Cópialo manualmente.');
  }
}

/**
 * Success dialog shown after the booking was created (legacy #confirmationModal).
 * `details`: { serviceNames (string[]), professionalName, date ('YYYY-MM-DD'), time, price (total of every service), email,
 * cancelToken (optional: the one-time secret the backend returns on creation) }.
 * With a token the dialog shows the cancel link; it is the only place the client can copy it from besides the email.
 * Legacy flags: static backdrop and `data-bs-keyboard="false"`: only the button closes it.
 */
export default function ConfirmationModal({ open, onClose, details }) {
  const cancelUrl = details?.cancelToken
    ? `${window.location.origin}/cancelar/${details.cancelToken}`
    : null;

  return (
    <Modal open={open} onClose={onClose} keyboard={false}>
      {details && (
        <div className="p-6 text-center cq-compact:p-4">
          <DialogTitle
            as="h4"
            className="mb-1 text-[length:calc(1.275rem+0.3vw)] leading-tight font-bold @7xl:text-xl cq-compact:text-[1.15rem]"
          >
            ¡Reserva Confirmada!
          </DialogTitle>
          <p className="mb-6 leading-loose text-text-secondary cq-compact:mb-3 cq-compact:text-[0.9rem] cq-compact:leading-snug">Te esperamos en tu cita</p>

          <div className="mb-6 rounded-lg border border-border bg-bg-tertiary p-4 text-left cq-compact:mb-3 cq-compact:p-3">
            <Row label="Servicios:">
              {details.serviceNames.join(', ')}
            </Row>
            <Row label="Profesional:">
              {details.professionalName}
            </Row>
            <Row label="Fecha:">
              {formatLongDateUTC(details.date)}
            </Row>
            <Row label="Hora:">
              {details.time}
            </Row>
            <Row label="Precio total:" last>
              {formatMoney(details.price)}
            </Row>
          </div>

          <p className="mb-6 text-[0.875em] leading-loose text-text-secondary cq-compact:mb-3 cq-compact:text-[0.8rem] cq-compact:leading-snug">
            Te enviamos la confirmación a <strong>{details.email}</strong>
          </p>

          {cancelUrl && (
            <div className="mb-6 rounded-lg border border-border bg-bg-tertiary p-3 text-left cq-compact:mb-3">
              <p className="mb-2 text-[0.875em] leading-snug text-text-secondary">
                ¿Necesitas cancelar? Puedes hacerlo con este enlace:
              </p>
              <a href={cancelUrl} className="mb-3 block text-[0.8rem] break-all text-accent underline">
                {cancelUrl}
              </a>
              <Button variant="outline" size="xs" onClick={() => copyLink(cancelUrl)}>
                Copiar enlace
              </Button>
            </div>
          )}

          <Button size="cta" onClick={onClose}>
            Entendido
          </Button>
        </div>
      )}
    </Modal>
  );
}
