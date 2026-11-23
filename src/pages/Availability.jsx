// Public availability page (/disponibilidad, SPEC 07): the link the business shares in its statuses
// and bio. It shows, in real time, the free times of the next days for one service; a time lists the
// professionals free at it. Tapping a time opens the booking flow with everything already chosen.

import { DialogTitle } from '@headlessui/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import BookingModal from '../components/booking/BookingModal.jsx';
import Container from '../components/layout/Container.jsx';
import BrandMark from '../components/ui/BrandMark.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import { getPublicAvailability } from '../services/publicAvailabilityService.js';
import { BookingProvider } from '../state/bookingState.jsx';
import { CatalogProvider } from '../state/catalogState.jsx';
import { dayLabel } from '../utils/publicAvailability.js';

const TIME_CHIP = 'w-full cursor-pointer touch-manipulation rounded-full border border-border bg-layer px-2 py-2 text-center text-sm font-semibold text-layer-foreground transition-colors duration-150 hover:bg-primary hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent touch:min-h-11';

function Notice({ children }) {
  return <p className="py-12 text-center text-text-secondary">{children}</p>;
}

function AvailabilityPage() {
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [data, setData] = useState(null);
  const [serviceId, setServiceId] = useState(undefined);
  const [picker, setPicker] = useState(null); // {date, time, professionals}
  const [prefill, setPrefill] = useState(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  // Only the latest request may write state.
  const latestRequest = useRef(0);

  const load = useCallback(async (id, { quiet = false } = {}) => {
    const request = ++latestRequest.current;
    if (!quiet) setStatus('loading');
    try {
      const result = await getPublicAvailability(id);
      if (request !== latestRequest.current) return;
      setData(result);
      setStatus('ready');
    } catch {
      if (request !== latestRequest.current) return;
      if (!quiet) setStatus('error');
    }
  }, []);

  useEffect(() => {
    load(serviceId);
    return () => { latestRequest.current += 1; };
  }, [load, serviceId]);

  const book = (date, time, professional) => {
    setPicker(null);
    setPrefill({ serviceId: data.serviceId, date, time, professionalId: professional.id });
    setBookingOpen(true);
  };

  const pickTime = (date, time, professionals) => {
    if (professionals.length === 1) book(date, time, professionals[0]);
    else setPicker({ date, time, professionals });
  };

  // The booking modal closes after a booking too: refresh quietly so a taken time disappears.
  const closeBooking = () => {
    setBookingOpen(false);
    load(data?.serviceId ?? serviceId, { quiet: true });
  };

  const today = data?.days?.[0]?.date;

  let body;
  if (status === 'loading' && !data) {
    body = (
      <div className="flex items-center justify-center gap-3 py-16 text-text-secondary">
        <Spinner />
        <span>Cargando turnos...</span>
      </div>
    );
  } else if (status === 'error') {
    body = (
      <div role="alert" className="flex flex-col items-center gap-4 py-12 text-center text-text-secondary">
        <p>No pudimos cargar los turnos. Revisa tu conexión e intenta nuevamente.</p>
        <Button size="sm" onClick={() => load(serviceId)}>Reintentar</Button>
      </div>
    );
  } else if (!data?.enabled) {
    body = <Notice>Esta página no está disponible por ahora.</Notice>;
  } else if (!data.serviceId) {
    body = <Notice>Todavía no hay turnos para mostrar.</Notice>;
  } else {
    body = (
      <>
        {data.services.length > 1 && (
          <div role="radiogroup" aria-label="Servicio" className="-mx-3 mb-5 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:mb-6 sm:flex-wrap sm:overflow-visible sm:px-0">
            {data.services.map((service) => (
              <button
                key={service.id}
                type="button"
                role="radio"
                aria-checked={service.id === data.serviceId}
                onClick={() => setServiceId(service.id)}
                className={`shrink-0 cursor-pointer rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent touch:min-h-11 ${service.id === data.serviceId ? 'border-primary-line bg-primary text-primary-foreground' : 'border-border bg-layer text-layer-foreground hover:bg-layer-hover'}`}
              >
                {service.name} <span className="font-normal opacity-80">· {service.duration} min</span>
              </button>
            ))}
          </div>
        )}
        <ul className="divide-y divide-border-subtle">
          {data.days.map((day) => (
            <li key={day.date} data-testid={`availability-day-${day.date}`} className="py-4">
              <h2 className="mb-2 text-[0.95rem] font-bold text-text-primary sm:text-base">{dayLabel(day.date, today)}</h2>
              {day.closed && <p className="text-sm text-text-muted">Cerrado</p>}
              {!day.closed && day.times.length === 0 && <p className="text-sm text-text-muted">Sin turnos</p>}
              {day.times.length > 0 && (
                <div className="grid grid-cols-4 gap-2 min-[420px]:grid-cols-5 sm:grid-cols-6">
                  {day.times.map(({ time, professionals }) => (
                    <button
                      key={time}
                      type="button"
                      data-testid={`availability-time-${day.date}-${time}`}
                      onClick={() => pickTime(day.date, time, professionals)}
                      className={TIME_CHIP}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary">
      <Container className="max-w-2xl! py-6 sm:py-8">
        <header className="mb-6 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center no-underline">
            <BrandMark textClassName="font-display text-lg font-bold tracking-wide text-text-primary" logoClassName="h-8 w-8" />
          </Link>
        </header>
        <h1 className="mb-1 font-display text-2xl leading-tight font-bold sm:text-3xl">Turnos disponibles</h1>
        <p className="mb-5 text-sm text-text-secondary sm:mb-6 sm:text-base">Toca una hora para reservarla.</p>
        {body}
      </Container>

      <Modal open={Boolean(picker)} onClose={() => setPicker(null)}>
        <div className="p-4">
          <DialogTitle as="h2" className="mb-1 text-lg font-bold text-text-primary">¿Con quién quieres reservar?</DialogTitle>
          {picker && (
            <p className="mb-4 text-sm text-text-secondary">{dayLabel(picker.date, today)} · {picker.time}</p>
          )}
          <div className="flex flex-col gap-2">
            {picker?.professionals.map((professional) => (
              <Button key={professional.id} size="sm" onClick={() => book(picker.date, picker.time, professional)}>
                {professional.name}
              </Button>
            ))}
            <Button size="sm" variant="secondary" onClick={() => setPicker(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Also renders the loading and confirmation dialogs the booking flow drives. */}
      <BookingModal open={bookingOpen} onClose={closeBooking} prefill={prefill} />
    </main>
  );
}

export default function Availability() {
  return (
    <CatalogProvider>
      <BookingProvider>
        <AvailabilityPage />
      </BookingProvider>
    </CatalogProvider>
  );
}
