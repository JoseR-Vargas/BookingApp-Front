// Public cancel page, reached from the link in the confirmation email (/cancelar/:token).
// The secret token in the URL is the only credential. The backend decides whether the booking can
// still be cancelled (one minute before it starts, business timezone): this page only renders the
// state it answers with and reacts to a refusal.

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Button from '../components/ui/Button.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import { cancelByToken, getCancellation } from '../services/cancellationService.js';
import { formatLongDateUTC } from '../utils/format.js';

const NOT_FOUND = 404;
const TOO_LATE = 409;

function Row({ icon, label, children, last = false }) {
  return (
    <div className={`flex items-start text-[0.95rem] text-text-primary ${last ? '' : 'mb-2'}`}>
      <i aria-hidden="true" className={`${icon} mt-[0.15rem] mr-2 shrink-0 text-accent`} />
      <span className="mr-1 text-text-secondary">{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

function Details({ summary }) {
  return (
    <div className="mb-6 rounded-lg border border-border bg-bg-tertiary p-4 text-left">
      <Row icon="fas fa-concierge-bell" label="Servicios:">
        {summary.services.map((service) => service.name).join(', ')}
      </Row>
      <Row icon="fas fa-user-tie" label="Profesional:">{summary.professional.name}</Row>
      <Row icon="fas fa-calendar-alt" label="Fecha:">{formatLongDateUTC(summary.date)}</Row>
      <Row icon="fas fa-clock" label="Hora:" last>{summary.time}</Row>
    </div>
  );
}

function Notice({ icon, tone, title, children }) {
  return (
    <div className="mb-6 text-center">
      <div
        aria-hidden="true"
        className={`mx-auto mb-4 flex size-16 items-center justify-center rounded-full border border-border bg-bg-tertiary text-[1.75rem] ${tone}`}
      >
        <i className={icon} />
      </div>
      <h2 className="mb-1 text-xl font-bold">{title}</h2>
      {children && <p className="leading-loose text-text-secondary">{children}</p>}
    </div>
  );
}

const BookAgain = () => (
  <Button href="/" size="sm" className="w-full">
    <i aria-hidden="true" className="fas fa-calendar-plus" /> Reservar de nuevo
  </Button>
);

export default function CancelBooking() {
  const { token } = useParams();
  // kind: loading | notFound | loadError | booking (summary.state tells the rest) | done
  const [view, setView] = useState({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);

  useEffect(() => {
    let active = true;
    setView({ kind: 'loading' });
    getCancellation(token)
      .then((summary) => active && setView({ kind: 'booking', summary }))
      .catch((error) => active && setView({ kind: error?.status === NOT_FOUND ? 'notFound' : 'loadError' }));
    return () => { active = false; };
  }, [token, attempt]);

  const handleConfirm = async () => {
    setBusy(true);
    setActionError(false);
    try {
      const summary = await cancelByToken(token);
      setView({ kind: 'done', summary });
    } catch (error) {
      if (error?.status === TOO_LATE) {
        setView((current) => ({ kind: 'booking', summary: { ...current.summary, state: 'closed' } }));
      } else if (error?.status === NOT_FOUND) {
        setView({ kind: 'notFound' });
      } else {
        setActionError(true);
      }
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const summary = view.summary;
  const state = view.kind === 'booking' ? summary.state : null;

  return (
    <main className="flex min-h-screen-dvh items-center justify-center bg-linear-[135deg,var(--color-bg-primary)_0%,var(--color-bg-tertiary)_100%] px-3 py-8">
      <div className="w-full max-w-lg rounded-lg border border-border bg-bg-secondary p-8 shadow-lg lte-sm:p-5">
        <h1 className="mb-6 text-center font-display text-[1.5rem] font-bold">Tu reserva</h1>

        {view.kind === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-6 text-text-secondary">
            <Spinner />
            <span>Cargando tu reserva...</span>
          </div>
        )}

        {view.kind === 'notFound' && (
          <Notice icon="fas fa-search" tone="text-text-secondary" title="No encontramos esta reserva">
            Revisa que hayas abierto el enlace del email completo.
          </Notice>
        )}

        {view.kind === 'loadError' && (
          <div role="alert" className="text-center">
            <Notice icon="fas fa-exclamation-triangle" tone="text-error" title="No pudimos cargar tu reserva">
              Hubo un problema de conexión o del servidor. Intenta nuevamente.
            </Notice>
            <Button size="sm" onClick={() => setAttempt((count) => count + 1)}>
              <i aria-hidden="true" className="fas fa-redo" /> Reintentar
            </Button>
          </div>
        )}

        {view.kind === 'done' && (
          <>
            <Notice icon="fas fa-check-circle" tone="text-success" title="Tu reserva fue cancelada">
              El horario quedó libre.
            </Notice>
            <Details summary={summary} />
            <BookAgain />
          </>
        )}

        {state === 'cancelled' && (
          <>
            <Notice icon="fas fa-ban" tone="text-text-secondary" title="Esta reserva ya fue cancelada" />
            <Details summary={summary} />
            <BookAgain />
          </>
        )}

        {state === 'closed' && (
          <>
            <Notice icon="fas fa-clock" tone="text-text-secondary" title="Ya no se puede cancelar esta reserva">
              El límite para cancelar es 1 minuto antes de la hora de inicio.
            </Notice>
            <Details summary={summary} />
            <BookAgain />
          </>
        )}

        {state === 'cancellable' && (
          <>
            <Details summary={summary} />
            <p className="mb-6 text-center text-[0.9rem] leading-loose text-text-secondary">
              Puedes cancelar tu reserva hasta 1 minuto antes de la hora de inicio.
            </p>
            {actionError && (
              <p role="alert" className="mb-4 text-center text-error">
                No pudimos cancelar tu reserva. Intenta nuevamente.
              </p>
            )}
            <Button variant="danger" size="sm" className="w-full" onClick={() => setConfirming(true)}>
              Cancelar reserva
            </Button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        variant="danger"
        busy={busy}
        title="Cancelar reserva"
        message={summary && (
          <>
            ¿Seguro que quieres cancelar tu reserva de{' '}
            <strong>{summary.services.map((service) => service.name).join(', ')}</strong> el{' '}
            <strong>{formatLongDateUTC(summary.date)}</strong> a las <strong>{summary.time}</strong>? Esta
            acción no se puede deshacer.
          </>
        )}
        confirmLabel="Sí, cancelar"
        cancelLabel="Volver"
        onConfirm={handleConfirm}
        onCancel={() => setConfirming(false)}
      />
    </main>
  );
}
