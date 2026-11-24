import { DialogTitle } from '@headlessui/react';
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

/**
 * Success dialog shown after the booking was created (legacy #confirmationModal).
 * `details`: { serviceNames (string[]), professionalName, locationName (optional, only when the business has several locations), date ('YYYY-MM-DD'), time, price (total of every service), email }.
 * It does not show the cancel link: that reaches the client in the confirmation email.
 * Legacy flags: static backdrop and `data-bs-keyboard="false"`: only the button closes it.
 */
export default function ConfirmationModal({ open, onClose, details }) {
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
            {details.locationName && (
              <Row label="Local:">
                {details.locationName}
              </Row>
            )}
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

          <Button size="cta" onClick={onClose}>
            Entendido
          </Button>
        </div>
      )}
    </Modal>
  );
}
