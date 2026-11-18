import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROFESSIONALS, SERVICES } from '../../test/catalogFixture.js';
import { BookingProvider } from '../../state/bookingState.jsx';
import { CatalogTestProvider } from '../../test/CatalogTestProvider.jsx';
import { toast } from '../../ui/toast.js';
import { formatLongDateUTC, formatMoney } from '../../utils/format.js';
import BookingModal from './BookingModal.jsx';

// Whole flows (typing included) run in jsdom; give slow CI machines some headroom.
vi.setConfig({ testTimeout: 20000 });

// The toast wrapper is the UI seam: every user-facing message is asserted through it.
vi.mock('../../ui/toast.js', () => ({
  toast: {
    show: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

// Dates far in the future so the `min=today` attribute is irrelevant.
const MONDAY = '2030-03-04';
const OTHER_MONDAY = '2030-03-11';
const SATURDAY = '2030-03-09';
const SUNDAY = '2030-03-10';
const CANCEL_TOKEN = 'abcDEF123_-abcDEF123_-abcDEF123_-abcDEF1234';
const API_URL = 'http://localhost:3000/api/bookings';
const AVAILABILITY_URL = 'http://localhost:3000/api/availability';
const CHECK_URL = `${API_URL}/availability`;

const MESSAGES = {
  desktopFallback:
    'No se pudieron verificar las reservas existentes. Se muestran todos los horarios disponibles. Te recomendamos confirmar por teléfono.',
  mobileFallback:
    'No se pueden verificar las reservas. Se muestran todos los horarios. Te recomendamos llamar para confirmar.',
};

const jsonResponse = (status, data) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
  text: async () => JSON.stringify(data),
});

const GRID_MINUTES = 30;

const minutesOf = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const formatTime = (minutes) => (
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
);

// 30-minute blocks (as start minutes) a professional works: a continuous day from 09:00
// (Mon-Fri until 20:00, Saturday until 18:00, Sunday is closed).
function openBlocks(date) {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  if (weekday === 0) return [];
  const closing = (weekday === 6 ? 18 : 20) * 60;
  const blocks = [];
  for (let minutes = 9 * 60; minutes < closing; minutes += GRID_MINUTES) blocks.push(minutes);
  return blocks;
}

// Every time from `from` to `to` (inclusive) on the 30-minute grid.
function gridTimes(from, to) {
  const times = [];
  for (let minutes = minutesOf(from); minutes <= minutesOf(to); minutes += GRID_MINUTES) times.push(formatTime(minutes));
  return times;
}

// Fake backend installed at the `fetch` boundary, so the REAL apiClient + bookingService run
// and the tests can assert the exact URL / method / body that reaches the network.
// It mirrors the real availability rules on the 30-minute grid: a window of
// ceil(totalDuration / 30) back-to-back blocks must be open and free of the professional's
// non-cancelled bookings (each booking occupies the blocks listed in `slots`, default [time]).
function installBackend({ bookings = [] } = {}) {
  const backend = {
    bookings,
    calls: [],
    availabilityError: null,
    postResponse: null,
    postGate: null,
    get posts() {
      return backend.calls.filter((c) => c.method === 'POST' && c.url === API_URL);
    },
    get checks() {
      return backend.calls.filter((c) => c.url === CHECK_URL);
    },
    get gets() {
      return backend.calls.filter((c) => c.method === 'GET');
    },
  };

  const occupiedBlocks = (date, professionalId) => new Set(
    backend.bookings
      .filter((b) => b.date === date && b.professional.id === professionalId && b.status !== 'cancelled')
      .flatMap((b) => (b.slots || [b.time]).map(minutesOf)),
  );

  const isWindowFree = (date, professionalId, startMinutes, serviceIds) => {
    const totalDuration = serviceIds
      .map((id) => SERVICES.find((service) => service.id === id).duration)
      .reduce((sum, duration) => sum + duration, 0);
    const open = openBlocks(date);
    const occupied = occupiedBlocks(date, professionalId);
    return Array.from({ length: Math.ceil(totalDuration / GRID_MINUTES) }, (_, i) => startMinutes + i * GRID_MINUTES)
      .every((block) => open.includes(block) && !occupied.has(block));
  };

  const availabilityFor = (date, serviceIds) => ({
    date,
    closed: openBlocks(date).length === 0,
    services: [],
    totalDuration: 0,
    professionals: PROFESSIONALS.map((professional) => ({
      id: professional.id,
      name: professional.name,
      slots: openBlocks(date)
        .filter((start) => isWindowFree(date, professional.id, start, serviceIds))
        .map(formatTime),
    })),
  });

  const fetchMock = vi.fn(async (url, options = {}) => {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    backend.calls.push({ url, method, body, headers: options.headers });

    if (url.startsWith(`${AVAILABILITY_URL}?`)) {
      if (backend.availabilityError) throw backend.availabilityError;
      const params = new URL(url).searchParams;
      return jsonResponse(200, availabilityFor(params.get('date'), params.get('serviceIds').split(',')));
    }
    if (url === CHECK_URL) {
      if (backend.availabilityError) throw backend.availabilityError;
      const available = isWindowFree(body.date, body.professionalId, minutesOf(body.time), body.serviceIds);
      return jsonResponse(200, { available });
    }
    if (backend.postGate) await backend.postGate;
    if (backend.postResponse) return backend.postResponse;
    // Like the real backend: the one-time cancel token travels in the creation response.
    return jsonResponse(201, { _id: 'new-id', ...body, cancelToken: CANCEL_TOKEN });
  });
  vi.stubGlobal('fetch', fetchMock);
  return backend;
}

const existingBooking = (overrides = {}) => ({
  _id: 'b1',
  date: MONDAY,
  time: '10:00',
  status: 'confirmed',
  professional: { id: 'alex-garcia', name: 'Alex García' },
  ...overrides,
});

function Harness({ initialOpen = true, catalog }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <CatalogTestProvider value={catalog}>
      <BookingProvider>
        <button type="button" onClick={() => setOpen(true)}>
          reopen
        </button>
        <BookingModal open={open} onClose={() => setOpen(false)} />
      </BookingProvider>
    </CatalogTestProvider>
  );
}

const bookingDialog = () => screen.getByRole('dialog', { name: 'Reservar tu Cita' });
const queryBookingDialog = () => screen.queryByRole('dialog', { name: 'Reservar tu Cita' });
const dateInput = () => screen.getByLabelText('Fecha de la cita');
const timeSelect = () => screen.getByLabelText('Hora de la cita');
const nextButton = () => screen.getByRole('button', { name: /Siguiente/ });
const professionalCard = (name) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

const serviceCard = (name) => screen.getByRole('button', { name: new RegExp(name) });

async function selectServices(user, ...names) {
  for (const name of names) await user.click(serviceCard(name));
}

// Selecting never advances by itself: the footer "Siguiente" moves on to step 2.
async function chooseService(user, ...names) {
  await selectServices(user, ...names);
  await user.click(nextButton());
  await screen.findByRole('heading', { name: 'Fecha y Hora' });
}

async function fillSchedule(user, { date = MONDAY, professional = 'Alex García', time = '11:00' } = {}) {
  fireEvent.change(dateInput(), { target: { value: date } });
  if (professional) await user.click(professionalCard(professional));
  if (time) {
    await waitFor(() => expect(within(timeSelect()).getByRole('option', { name: time })).toBeInTheDocument());
    await user.selectOptions(timeSelect(), time);
  }
}

async function goToForm(user, schedule) {
  await chooseService(user, 'Servicio Básico');
  await fillSchedule(user, schedule);
  await user.click(nextButton());
  await screen.findByRole('heading', { name: 'Tus Datos' });
}

async function fillClient(user, overrides = {}) {
  const data = {
    name: 'Juan Pérez',
    email: 'juan@example.com',
    phone: '+598 98 114 696',
    notes: '',
    terms: true,
    ...overrides,
  };
  await user.type(screen.getByLabelText('Nombre completo'), data.name);
  await user.type(screen.getByLabelText('Dirección de email'), data.email);
  await user.type(screen.getByLabelText('Número de teléfono'), data.phone);
  if (data.notes) await user.type(screen.getByLabelText('Notas adicionales'), data.notes);
  if (data.terms) await user.click(screen.getByRole('checkbox', { name: /Acepto los/ }));
}

const confirmButton = () => screen.getByRole('button', { name: /Confirmar Reserva|Procesando/ });

async function reachReadyToConfirm(user, { schedule, client } = {}) {
  await goToForm(user, schedule);
  await fillClient(user, client);
}

let originalInnerWidth;

beforeEach(() => {
  originalInnerWidth = globalThis.innerWidth;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  globalThis.innerWidth = originalInnerWidth;
});

describe('BookingModal happy path', () => {
  it('tells the client to cancel from the email instead of showing the cancel link', async () => {
    installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);

    await reachReadyToConfirm(user);
    await user.click(confirmButton());

    const confirmation = await screen.findByRole('dialog', { name: '¡Reserva Confirmada!' });
    expect(within(confirmation).getByText('Para cancelar la reserva puedes hacerlo desde el email.')).toBeInTheDocument();
    // The backend still answers with the one-time token (the email carries it): the page never shows it.
    expect(within(confirmation).queryByRole('link')).not.toBeInTheDocument();
    expect(confirmation.textContent).not.toContain('/cancelar/');
    expect(confirmation.textContent).not.toContain(CANCEL_TOKEN);
    expect(within(confirmation).queryByRole('button', { name: 'Copiar enlace' })).not.toBeInTheDocument();
  });

  it('walks the 3 steps and posts the legacy-shaped payload, then shows the confirmation', async () => {
    const backend = installBackend({ bookings: [existingBooking({ time: '10:00' })] });
    const user = userEvent.setup({ delay: null });
    render(<Harness />);

    expect(bookingDialog()).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Elige tu Servicio' })).toBeInTheDocument();

    await goToForm(user);
    await fillClient(user, { notes: 'Sin gluten' });
    await user.click(confirmButton());

    const confirmation = await screen.findByRole('dialog', { name: '¡Reserva Confirmada!' });
    expect(within(confirmation).getByText('Servicio Básico')).toBeInTheDocument();
    expect(within(confirmation).getByText('Alex García')).toBeInTheDocument();
    expect(within(confirmation).getByText(formatLongDateUTC(MONDAY))).toBeInTheDocument();
    expect(within(confirmation).getByText('11:00')).toBeInTheDocument();
    expect(within(confirmation).getByText(formatMoney(1200))).toBeInTheDocument();
    expect(within(confirmation).getByText('juan@example.com')).toBeInTheDocument();

    // Wire contract: exact URL, method and body (including status 'confirmed').
    expect(backend.posts).toHaveLength(1);
    const [post] = backend.posts;
    expect(post.url).toBe(API_URL);
    expect(post.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(post.body).toEqual({
      client: { name: 'Juan Pérez', id: '', email: 'juan@example.com', phone: '+598 98 114 696' },
      services: [{ id: 'servicio-basico' }],
      professional: { id: 'alex-garcia', name: 'Alex García' },
      date: MONDAY,
      time: '11:00',
      notes: 'Sin gluten',
      status: 'confirmed',
    });

    // Order of network calls: slots lookup, pre-submit availability check, then the POST.
    expect(backend.calls.map((c) => c.method)).toEqual(['GET', 'POST', 'POST']);
    expect(backend.calls.map((c) => c.url)).toEqual([
      `${AVAILABILITY_URL}?date=${MONDAY}&serviceIds=servicio-basico`,
      CHECK_URL,
      API_URL,
    ]);
    expect(backend.checks[0].body).toEqual({
      date: MONDAY,
      time: '11:00',
      professionalId: 'alex-garcia',
      serviceIds: ['servicio-basico'],
    });

    // The booking modal is gone and no error toast was shown.
    await waitFor(() => expect(queryBookingDialog()).not.toBeInTheDocument());
    expect(toast.error).not.toHaveBeenCalled();

    // The confirmation can be dismissed with its own button.
    await user.click(within(confirmation).getByRole('button', { name: 'Entendido' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '¡Reserva Confirmada!' })).not.toBeInTheDocument(),
    );
  });

  it('toggles services: several can be pressed at once and a second tap unselects', async () => {
    installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);

    const basic = serviceCard('Servicio Básico');
    const premium = serviceCard('Servicio Premium');
    expect(basic).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('service-check-servicio-basico')).not.toBeInTheDocument();

    await user.click(basic);
    await user.click(premium);
    expect(basic).toHaveAttribute('aria-pressed', 'true');
    expect(premium).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('service-check-servicio-basico')).toBeInTheDocument();
    expect(serviceCard('Consulta Inicial')).toHaveAttribute('aria-pressed', 'false');

    await user.click(basic);
    expect(basic).toHaveAttribute('aria-pressed', 'false');
    expect(premium).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows a "+ Agregar" affordance on every service that turns into "Agregado" once chosen', async () => {
    installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);

    expect(within(serviceCard('Consulta Inicial')).getByText('Agregar')).toBeInTheDocument();
    expect(within(serviceCard('Servicio Básico')).getByText('Agregar')).toBeInTheDocument();

    await user.click(serviceCard('Servicio Básico'));

    expect(within(serviceCard('Servicio Básico')).getByText('Agregado')).toBeInTheDocument();
    expect(within(serviceCard('Servicio Básico')).queryByText('Agregar')).not.toBeInTheDocument();
    expect(within(serviceCard('Consulta Inicial')).getByText('Agregar')).toBeInTheDocument();
  });

  it('opens every step from the top: the modal scroll resets on "Siguiente" and "Anterior"', async () => {
    installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    const viewport = screen.getByTestId('modal-viewport');

    await selectServices(user, 'Servicio Básico');
    viewport.scrollTop = 400;
    await user.click(nextButton());
    await screen.findByRole('heading', { name: 'Fecha y Hora' });
    expect(viewport.scrollTop).toBe(0);

    viewport.scrollTop = 400;
    await user.click(screen.getByRole('button', { name: /Anterior/ }));
    expect(viewport.scrollTop).toBe(0);
  });

  it('does not advance when a service is chosen: only "Siguiente" does', async () => {
    installBackend();
    render(<Harness />);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    fireEvent.click(serviceCard('Consulta Inicial'));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole('heading', { name: 'Fecha y Hora' })).not.toBeInTheDocument();

    fireEvent.click(nextButton());
    expect(screen.getByRole('heading', { name: 'Fecha y Hora' })).toBeInTheDocument();
  });

  it('shows a summary bar with count, total price and total minutes only while something is selected', async () => {
    installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    expect(screen.queryByTestId('service-selection-summary')).not.toBeInTheDocument();

    await selectServices(user, 'Consulta Inicial');
    expect(screen.getByTestId('service-selection-summary')).toHaveTextContent(`1 servicio · ${formatMoney(500)} · 30 min`);

    await selectServices(user, 'Servicio Básico', 'Servicio Premium');
    expect(screen.getByTestId('service-selection-summary')).toHaveTextContent(`3 servicios · ${formatMoney(4200)} · 180 min`);

    await selectServices(user, 'Consulta Inicial', 'Servicio Básico', 'Servicio Premium');
    expect(screen.queryByTestId('service-selection-summary')).not.toBeInTheDocument();
  });

  it('disables a service that would leave no professional offering the whole selection', async () => {
    installBackend();
    const user = userEvent.setup({ delay: null });
    const consulta = SERVICES.find((s) => s.id === 'consulta-inicial');
    const premium = SERVICES.find((s) => s.id === 'servicio-premium');
    const originals = [consulta.professionals, premium.professionals];
    consulta.professionals = ['alex-garcia'];
    premium.professionals = ['maria-lopez'];
    try {
      render(<Harness />);
      expect(serviceCard('Servicio Premium')).toBeEnabled();

      await user.click(serviceCard('Consulta Inicial'));

      expect(serviceCard('Servicio Premium')).toBeDisabled();
      expect(serviceCard('Servicio Premium')).toHaveTextContent('Sin profesional en común con tu selección');
      expect(serviceCard('Servicio Básico')).toBeEnabled();

      await user.click(serviceCard('Consulta Inicial'));
      expect(serviceCard('Servicio Premium')).toBeEnabled();
    } finally {
      consulta.professionals = originals[0];
      premium.professionals = originals[1];
    }
  });

  it('shows the selected-services recap with every service, total price and total duration', async () => {
    installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);

    await chooseService(user, 'Servicio Premium', 'Consulta Inicial');
    const box = screen.getByTestId('selected-service-info');
    expect(box).toHaveTextContent('Servicio Premium');
    expect(box).toHaveTextContent('Consulta Inicial');
    expect(box).toHaveTextContent('Profesional: No seleccionado');
    expect(box).toHaveTextContent(`Precio total: ${formatMoney(3000)}`);
    expect(box).toHaveTextContent('Fecha: No seleccionada');
    expect(box).toHaveTextContent('Hora: No seleccionada');
    expect(box).toHaveTextContent('Duración total: 120 minutos');

    await fillSchedule(user);
    expect(box).toHaveTextContent('Profesional: Alex García');
    expect(box).toHaveTextContent(`Fecha: ${formatLongDateUTC(MONDAY)}`);
    expect(box).toHaveTextContent('Hora: 11:00');
  });

  it('offers only the professionals that offer every selected service', async () => {
    installBackend();
    const user = userEvent.setup({ delay: null });
    const service = SERVICES.find((s) => s.id === 'consulta-inicial');
    const original = service.professionals;
    service.professionals = ['maria-lopez'];
    try {
      render(<Harness />);
      await chooseService(user, 'Servicio Básico', 'Consulta Inicial');

      expect(professionalCard('María López')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Alex García/ })).not.toBeInTheDocument();
    } finally {
      service.professionals = original;
    }
  });

  it('drops the chosen time when the selection changes after going back', async () => {
    installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await chooseService(user, 'Servicio Básico');
    await fillSchedule(user);

    await user.click(screen.getByRole('button', { name: /Anterior/ }));
    await user.click(serviceCard('Servicio Premium'));
    await user.click(nextButton());

    expect(screen.getByTestId('selected-service-info')).toHaveTextContent('Hora: No seleccionada');
    await user.click(nextButton());
    expect(toast.error).toHaveBeenLastCalledWith('Por favor selecciona una hora');
  });

  it('keeps the date input min=today (legacy setupDateValidation)', async () => {
    installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await chooseService(user, 'Servicio Básico');

    expect(dateInput()).toHaveAttribute('min', new Date().toISOString().split('T')[0]);
    expect(dateInput()).toBeRequired();
  });
});

const optionValues = () => within(timeSelect())
  .getAllByRole('option')
  .map((o) => o.value)
  .filter(Boolean);

describe('time slots', () => {
  it('offers only free start times on the 30-minute grid: no "Ocupado" rows, nothing disabled', async () => {
    installBackend({ bookings: [existingBooking({ time: '10:00' })] });
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await chooseService(user, 'Servicio Básico');
    await fillSchedule(user, { time: null });

    // Básico = 2 blocks. Alex is busy 10:00, so the windows starting 09:30 and 10:00 are gone.
    await within(timeSelect()).findByRole('option', { name: 'Selecciona una hora (19 disponibles)' });
    expect(within(timeSelect()).getByRole('option', { name: '09:00' })).toBeEnabled();
    expect(within(timeSelect()).getByRole('option', { name: '10:30' })).toBeEnabled();
    expect(within(timeSelect()).queryByRole('option', { name: '09:30' })).not.toBeInTheDocument();
    expect(within(timeSelect()).queryByRole('option', { name: '10:00' })).not.toBeInTheDocument();
    expect(within(timeSelect()).queryByRole('option', { name: /Ocupado/ })).not.toBeInTheDocument();
    within(timeSelect()).getAllByRole('option').forEach((option) => expect(option).toBeEnabled());
  });

  it('asks the backend for the whole selection and lists only the windows that fit', async () => {
    const backend = installBackend({ bookings: [existingBooking({ time: '11:00' })] });
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    // Consulta 30 + Básico 60 + Premium 90 = 180 min = 6 consecutive 30-minute blocks.
    await chooseService(user, 'Consulta Inicial', 'Servicio Básico', 'Servicio Premium');
    await fillSchedule(user, { time: null });

    await within(timeSelect()).findByRole('option', { name: /disponibles/ });
    expect(backend.gets[0].url).toBe(
      `${AVAILABILITY_URL}?date=${MONDAY}&serviceIds=consulta-inicial,servicio-basico,servicio-premium`,
    );
    // Alex is busy 11:00: windows starting 09:00..11:00 touch it, windows after 17:00 cross the closing.
    expect(optionValues()).toEqual(gridTimes('11:30', '17:00'));
    expect(within(timeSelect()).getByRole('option', { name: 'Selecciona una hora (12 disponibles)' })).toBeInTheDocument();
  });

  it('asks again with the new selection when the services change after going back', async () => {
    const backend = installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await chooseService(user, 'Servicio Básico');
    await fillSchedule(user, { time: null });
    await within(timeSelect()).findByRole('option', { name: 'Selecciona una hora (21 disponibles)' });

    await user.click(screen.getByRole('button', { name: /Anterior/ }));
    await user.click(serviceCard('Consulta Inicial'));
    await user.click(nextButton());

    // 60 + 30 min need three blocks: 18:30 is the last valid start, 19:00 would cross the closing.
    await within(timeSelect()).findByRole('option', { name: 'Selecciona una hora (20 disponibles)' });
    expect(within(timeSelect()).getByRole('option', { name: '18:30' })).toBeEnabled();
    expect(within(timeSelect()).queryByRole('option', { name: '19:00' })).not.toBeInTheDocument();
    expect(backend.gets).toHaveLength(2);
    expect(backend.gets[1].url).toBe(`${AVAILABILITY_URL}?date=${MONDAY}&serviceIds=servicio-basico,consulta-inicial`);
  });

  it('ignores cancelled bookings and bookings of other professionals or days', async () => {
    installBackend({
      bookings: [
        existingBooking({ time: '09:00', status: 'cancelled' }),
        existingBooking({ time: '12:00', professional: { id: 'maria-lopez', name: 'María López' } }),
        existingBooking({ time: '15:00', date: OTHER_MONDAY }),
      ],
    });
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await chooseService(user, 'Servicio Básico');
    await fillSchedule(user, { time: null });

    await within(timeSelect()).findByRole('option', { name: 'Selecciona una hora (21 disponibles)' });
    expect(optionValues()).toEqual(gridTimes('09:00', '19:00'));
  });

  it('shows a start every 30 minutes from 09:00 to 19:00 on weekdays, 09:30 and 13:30 included', async () => {
    installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await chooseService(user, 'Servicio Básico');
    await fillSchedule(user, { time: null });
    await within(timeSelect()).findByRole('option', { name: /disponibles/ });

    const values = optionValues();
    expect(values).toEqual(gridTimes('09:00', '19:00'));
    expect(values).toContain('09:30');
    expect(values).toContain('13:30');
    expect(values).not.toContain('19:30');
    expect(values).not.toContain('20:00');
  });

  it('closes on Sunday with the "Cerrado este día" label once a professional is chosen', async () => {
    const backend = installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await chooseService(user, 'Servicio Básico');

    fireEvent.change(dateInput(), { target: { value: SUNDAY } });
    expect(within(timeSelect()).getByRole('option', { name: 'Selecciona un profesional primero' })).toBeInTheDocument();
    expect(backend.gets).toHaveLength(0);

    await user.click(professionalCard('Alex García'));
    await within(timeSelect()).findByRole('option', { name: 'Cerrado este día' });
    expect(within(timeSelect()).getAllByRole('option')).toHaveLength(1);
    expect(backend.gets).toHaveLength(1);
  });

  it('closes at 18:00 on Saturday (last start 17:00 for a one-hour service)', async () => {
    installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await chooseService(user, 'Servicio Básico');
    await fillSchedule(user, { date: SATURDAY, time: null });
    await within(timeSelect()).findByRole('option', { name: /disponibles/ });

    const values = optionValues();
    expect(values).toEqual(gridTimes('09:00', '17:00'));
    expect(values).not.toContain('17:30');
    expect(values).not.toContain('18:00');
  });

  it('says there are no times when the chosen professional is fully booked', async () => {
    installBackend({
      bookings: gridTimes('09:00', '19:30').map((time) => existingBooking({ time })),
    });
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await chooseService(user, 'Servicio Básico');
    await fillSchedule(user, { time: null });

    await within(timeSelect()).findByRole('option', { name: 'No hay horarios disponibles' });
    expect(within(timeSelect()).getAllByRole('option')).toHaveLength(1);
  });

  it('shows no times, count or request until a professional is chosen', async () => {
    const backend = installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await chooseService(user, 'Servicio Básico');

    expect(within(timeSelect()).getByRole('option', { name: 'Selecciona una fecha primero' })).toBeInTheDocument();

    fireEvent.change(dateInput(), { target: { value: MONDAY } });
    expect(within(timeSelect()).getAllByRole('option').map((o) => o.textContent)).toEqual(['Selecciona un profesional primero']);
    expect(optionValues()).toEqual([]);
    expect(timeSelect()).not.toHaveTextContent(/disponibles/);
    expect(screen.getByText('Elige un profesional para ver sus horarios disponibles')).toBeInTheDocument();
    expect(backend.gets).toHaveLength(0);
  });

  it("shows the chosen professional's count and times, and switching professional does not refetch", async () => {
    const backend = installBackend({
      bookings: [
        existingBooking({ time: '10:00', slots: ['10:00', '10:30'] }),
        existingBooking({ time: '12:00', slots: ['12:00', '12:30'], professional: { id: 'maria-lopez', name: 'María López' } }),
      ],
    });
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await chooseService(user, 'Servicio Básico');
    fireEvent.change(dateInput(), { target: { value: MONDAY } });

    // Alex (busy 10:00-11:00): windows starting 09:30, 10:00 and 10:30 are gone.
    await user.click(professionalCard('Alex García'));
    await within(timeSelect()).findByRole('option', { name: 'Selecciona una hora (18 disponibles)' });
    expect(optionValues()).not.toContain('10:00');
    expect(optionValues()).toContain('12:00');

    // María (busy 12:00-13:00): windows starting 11:30, 12:00 and 12:30 are gone.
    await user.click(professionalCard('María López'));
    expect(within(timeSelect()).getByRole('option', { name: 'Selecciona una hora (18 disponibles)' })).toBeInTheDocument();
    expect(optionValues()).toContain('10:00');
    expect(optionValues()).not.toContain('12:00');

    expect(backend.gets).toHaveLength(1);
  });

  it('shows the loading option text while bookings are being fetched', async () => {
    const backend = installBackend();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (...args) => {
      await gate;
      return originalFetch(...args);
    });
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await chooseService(user, 'Servicio Básico');
    await fillSchedule(user, { time: null });

    expect(within(timeSelect()).getByRole('option', { name: 'Verificando horarios disponibles' })).toBeInTheDocument();
    release();
    await within(timeSelect()).findByRole('option', { name: /disponibles\)/ });
    expect(backend.gets).toHaveLength(1);
  });
});

describe('availability recomputation (deliberate improvements)', () => {
  it('refreshes the slots when the date changes after a professional was chosen', async () => {
    const backend = installBackend({ bookings: [existingBooking({ date: OTHER_MONDAY, time: '16:00' })] });
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await chooseService(user, 'Servicio Básico');
    await fillSchedule(user, { time: null });
    await within(timeSelect()).findByRole('option', { name: 'Selecciona una hora (21 disponibles)' });
    expect(backend.gets).toHaveLength(1);

    fireEvent.change(dateInput(), { target: { value: OTHER_MONDAY } });

    await within(timeSelect()).findByRole('option', { name: 'Selecciona una hora (19 disponibles)' });
    expect(optionValues()).not.toContain('16:00');
    expect(optionValues()).not.toContain('15:30');
    expect(optionValues()).toContain('16:30');
    expect(backend.gets).toHaveLength(2);
  });

  it('keeps the selected time while it stays valid and clears it when it is no longer free', async () => {
    installBackend({ bookings: [existingBooking({ date: OTHER_MONDAY, time: '11:00' })] });
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await chooseService(user, 'Servicio Básico');
    await fillSchedule(user, { time: '11:00' });
    expect(timeSelect()).toHaveValue('11:00');
    expect(screen.getByTestId('selected-service-info')).toHaveTextContent('Hora: 11:00');

    // Another professional, same date: 11:00 is still free, so it is kept.
    await user.click(professionalCard('María López'));
    await waitFor(() => expect(timeSelect()).toHaveValue('11:00'));
    expect(screen.getByTestId('selected-service-info')).toHaveTextContent('Hora: 11:00');

    // Back to Alex on a date where Alex is busy at 11:00: the stale time must go away.
    await user.click(professionalCard('Alex García'));
    fireEvent.change(dateInput(), { target: { value: OTHER_MONDAY } });
    await within(timeSelect()).findByRole('option', { name: /disponibles\)/ });
    expect(within(timeSelect()).queryByRole('option', { name: '11:00' })).not.toBeInTheDocument();

    // The stale time is cleared from the state AND from the select.
    await waitFor(() => expect(screen.getByTestId('selected-service-info')).toHaveTextContent('Hora: No seleccionada'));
    expect(timeSelect()).toHaveValue('');
    await user.click(nextButton());
    expect(toast.error).toHaveBeenCalledWith('Por favor selecciona una hora');
  });

  it('clears the selected time when the newly chosen professional is busy at that time', async () => {
    installBackend({
      bookings: [existingBooking({ time: '11:00', professional: { id: 'maria-lopez', name: 'María López' } })],
    });
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await chooseService(user, 'Servicio Básico');
    await fillSchedule(user, { time: '11:00' });
    expect(timeSelect()).toHaveValue('11:00');

    await user.click(professionalCard('María López'));

    await waitFor(() => expect(screen.getByTestId('selected-service-info')).toHaveTextContent('Hora: No seleccionada'));
    expect(timeSelect()).toHaveValue('');
    expect(within(timeSelect()).queryByRole('option', { name: '11:00' })).not.toBeInTheDocument();
  });

  it('keeps a 30-minute time while it is free and clears it once it is not', async () => {
    installBackend({ bookings: [existingBooking({ date: OTHER_MONDAY, time: '11:30' })] });
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await chooseService(user, 'Servicio Básico');
    await fillSchedule(user, { time: '11:30' });
    expect(timeSelect()).toHaveValue('11:30');

    fireEvent.change(dateInput(), { target: { value: OTHER_MONDAY } });
    await within(timeSelect()).findByRole('option', { name: /disponibles\)/ });

    await waitFor(() => expect(screen.getByTestId('selected-service-info')).toHaveTextContent('Hora: No seleccionada'));
    expect(timeSelect()).toHaveValue('');
  });

  it('clears the selected time when the date becomes a closed Sunday', async () => {
    installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await chooseService(user, 'Servicio Básico');
    await fillSchedule(user, { time: '11:00' });

    fireEvent.change(dateInput(), { target: { value: SUNDAY } });
    await within(timeSelect()).findByRole('option', { name: 'Cerrado este día' });

    await waitFor(() => expect(screen.getByTestId('selected-service-info')).toHaveTextContent('Hora: No seleccionada'));
  });
});

describe('availability fetch failures', () => {
  it('retries twice on a network failure, then warns and falls back to the local 30-minute grid', async () => {
    const backend = installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await chooseService(user, 'Servicio Básico');

    backend.availabilityError = new TypeError('Failed to fetch');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.change(dateInput(), { target: { value: MONDAY } });
    fireEvent.click(professionalCard('Alex García'));

    const optionTexts = () => within(timeSelect()).getAllByRole('option').map((o) => o.textContent);
    expect(optionTexts()).toEqual(['Verificando horarios disponibles']);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(optionTexts()).toEqual(['Reintentando... (1/2)']);
    expect(backend.gets).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1499);
    });
    expect(backend.gets).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(backend.gets).toHaveLength(2);
    expect(optionTexts()).toEqual(['Reintentando... (2/2)']);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(backend.gets).toHaveLength(3);

    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalledWith(MESSAGES.desktopFallback, 10000);
    // The grid is rebuilt locally (the backend still validates on create): 09:00..19:30, every 30 min.
    expect(optionTexts()[0]).toBe('Selecciona una hora (22 disponibles)');
    expect(optionValues()).toEqual(gridTimes('09:00', '19:30'));
    expect(within(timeSelect()).queryByRole('option', { name: /Ocupado/ })).not.toBeInTheDocument();

    // No further retries are scheduled.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(backend.gets).toHaveLength(3);
  });

  it('uses the mobile copy and the longer retry delay on small screens', async () => {
    const backend = installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await chooseService(user, 'Servicio Básico');

    globalThis.innerWidth = 500;
    backend.availabilityError = new TypeError('Failed to fetch');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.change(dateInput(), { target: { value: MONDAY } });
    fireEvent.click(professionalCard('Alex García'));

    const optionTexts = () => within(timeSelect()).getAllByRole('option').map((o) => o.textContent);
    expect(optionTexts()).toEqual(['Cargando horarios...']);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(optionTexts()).toEqual(['Reintentando conexión... (1/2)']);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2499);
    });
    expect(backend.gets).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(backend.gets).toHaveLength(2);
    expect(optionTexts()).toEqual(['Reintentando conexión... (2/2)']);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(backend.gets).toHaveLength(3);
    expect(toast.warning).toHaveBeenCalledWith(MESSAGES.mobileFallback, 10000);
  });

  it('retries on a Timeout error and recovers when a later attempt succeeds', async () => {
    const backend = installBackend({ bookings: [existingBooking({ time: '10:00' })] });
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await chooseService(user, 'Servicio Básico');

    backend.availabilityError = new Error('Timeout: La solicitud tardó demasiado tiempo.');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.change(dateInput(), { target: { value: MONDAY } });
    fireEvent.click(professionalCard('Alex García'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(within(timeSelect()).getByRole('option', { name: 'Reintentando... (1/2)' })).toBeInTheDocument();

    backend.availabilityError = null;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    // The real backend answer wins over the fallback grid: 10:00 (and the 09:30 window touching it) are absent.
    expect(within(timeSelect()).getByRole('option', { name: '09:00' })).toBeInTheDocument();
    expect(within(timeSelect()).getByRole('option', { name: '10:30' })).toBeInTheDocument();
    expect(within(timeSelect()).queryByRole('option', { name: '10:00' })).not.toBeInTheDocument();
    expect(within(timeSelect()).queryByRole('option', { name: '09:30' })).not.toBeInTheDocument();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('does not retry an HTTP error: it warns immediately and shows the local 30-minute grid', async () => {
    const backend = installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await chooseService(user, 'Servicio Básico');

    backend.availabilityError = new Error('HTTP error! status: 500');
    await fillSchedule(user, { time: null });

    await within(timeSelect()).findByRole('option', { name: 'Selecciona una hora (22 disponibles)' });
    expect(optionValues()).toContain('09:30');
    expect(backend.gets).toHaveLength(1);
    expect(toast.warning).toHaveBeenCalledWith(MESSAGES.desktopFallback, 10000);
  });
});

describe('step navigation and validation', () => {
  it('hides Anterior on step 1 and navigates back and forth', async () => {
    installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);

    expect(screen.queryByRole('button', { name: /Anterior/ })).not.toBeInTheDocument();
    expect(nextButton()).toBeInTheDocument();

    await chooseService(user, 'Servicio Básico');
    await user.click(screen.getByRole('button', { name: /Anterior/ }));
    expect(screen.getByRole('heading', { name: 'Elige tu Servicio' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Fecha y Hora' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Anterior/ })).not.toBeInTheDocument();
    // The selection survives the round trip.
    expect(screen.getByRole('button', { name: /Servicio Básico/ })).toHaveAttribute('aria-pressed', 'true');

    await user.click(nextButton());
    expect(screen.getByRole('heading', { name: 'Fecha y Hora' })).toBeInTheDocument();
  });

  it('labels the footer button for each step', async () => {
    installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);

    expect(nextButton()).toHaveTextContent('Siguiente');
    await goToForm(user);
    expect(screen.getByRole('button', { name: 'Confirmar Reserva' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Siguiente/ })).not.toBeInTheDocument();
  });

  it('asks for a service on step 1', async () => {
    installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);

    await user.click(nextButton());

    expect(toast.error).toHaveBeenCalledWith('Por favor selecciona un servicio');
    expect(screen.getByRole('heading', { name: 'Elige tu Servicio' })).toBeInTheDocument();
  });

  it('asks for a date, then a professional, then a time on step 2; times only exist once a professional is chosen', async () => {
    installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await chooseService(user, 'Servicio Básico');

    await user.click(nextButton());
    expect(toast.error).toHaveBeenLastCalledWith('Por favor selecciona una fecha');

    fireEvent.change(dateInput(), { target: { value: MONDAY } });
    await user.click(nextButton());
    expect(toast.error).toHaveBeenLastCalledWith('Por favor selecciona un profesional');
    expect(optionValues()).toEqual([]);

    // Times belong to a professional, so the professional has to be chosen before the time.
    await user.click(professionalCard('Alex García'));
    await within(timeSelect()).findByRole('option', { name: '11:00' });
    await user.click(nextButton());
    expect(toast.error).toHaveBeenLastCalledWith('Por favor selecciona una hora');
    await user.selectOptions(timeSelect(), '11:00');
    await user.click(nextButton());
    await screen.findByRole('heading', { name: 'Tus Datos' });

    expect(toast.error).toHaveBeenCalledTimes(3);
  });

  it('flags the form as validated and toasts when step 3 is submitted empty', async () => {
    const backend = installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await goToForm(user);

    const form = screen.getByTestId('client-form');
    expect(form).not.toHaveAttribute('data-validated');

    await user.click(confirmButton());

    expect(toast.error).toHaveBeenCalledWith('Por favor completa todos los campos requeridos');
    expect(form).toHaveAttribute('data-validated', 'true');
    expect(screen.getByText('Por favor ingresa tu nombre completo')).toBeInTheDocument();
    expect(screen.getByText('Por favor ingresa un email válido')).toBeInTheDocument();
    expect(screen.getByText('Por favor ingresa tu teléfono')).toBeInTheDocument();
    expect(screen.getByText('Debes aceptar los términos y condiciones')).toBeInTheDocument();
    expect(backend.posts).toHaveLength(0);
  });

  it('keeps the legacy form attributes (required, placeholders, hidden cédula, optional notes)', async () => {
    installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await goToForm(user);

    const name = screen.getByLabelText('Nombre completo');
    expect(name).toBeRequired();
    expect(name).toHaveAttribute('placeholder', 'Tu nombre completo');
    const email = screen.getByLabelText('Dirección de email');
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toBeRequired();
    expect(email).toHaveAttribute('placeholder', 'tu@email.com');
    const phone = screen.getByLabelText('Número de teléfono');
    expect(phone).toHaveAttribute('type', 'tel');
    expect(phone).toBeRequired();
    expect(phone).toHaveAttribute('placeholder', '+598 98 114 696');
    const notes = screen.getByLabelText('Notas adicionales');
    expect(notes).not.toBeRequired();
    expect(notes).toHaveAttribute('placeholder', 'Cualquier comentario especial...');
    expect(screen.getByRole('checkbox', { name: /Acepto los/ })).toBeRequired();
    expect(screen.getByRole('link', { name: 'términos y condiciones' })).toHaveAttribute('target', '_blank');
    // The "Cédula" field exists but is not shown (legacy `display: none` column).
    expect(screen.getByLabelText('Número de cédula')).not.toBeVisible();
  });

  it('rejects an invalid email on step 3', async () => {
    const backend = installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await reachReadyToConfirm(user, { client: { email: 'not-an-email' } });

    await user.click(confirmButton());

    expect(toast.error).toHaveBeenCalledWith('Por favor completa todos los campos requeridos');
    expect(backend.posts).toHaveLength(0);
  });
});

describe('submit sequence', () => {
  it('posts every selected service id and confirms with all names and the total price', async () => {
    const backend = installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await chooseService(user, 'Consulta Inicial', 'Servicio Básico', 'Servicio Premium');
    await fillSchedule(user, { time: '09:00' });
    await user.click(nextButton());
    await screen.findByRole('heading', { name: 'Tus Datos' });
    await fillClient(user);
    await user.click(confirmButton());

    const confirmation = await screen.findByRole('dialog', { name: '¡Reserva Confirmada!' });
    expect(backend.posts[0].body.services).toEqual([
      { id: 'consulta-inicial' },
      { id: 'servicio-basico' },
      { id: 'servicio-premium' },
    ]);
    expect(backend.posts[0].body).not.toHaveProperty('service');
    expect(within(confirmation).getByText('Consulta Inicial, Servicio Básico, Servicio Premium')).toBeInTheDocument();
    expect(within(confirmation).getByText(formatMoney(4200))).toBeInTheDocument();
  });

  it('blocks the submit when the pre-check says the slot was just taken', async () => {
    const backend = installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await reachReadyToConfirm(user);

    // Somebody else books 11:00 with Alex between the slot lookup and the confirmation.
    backend.bookings = [existingBooking({ time: '11:00' })];
    await user.click(confirmButton());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        `Lo sentimos, Alex García ya tiene una reserva para ${MONDAY} a las 11:00. Por favor selecciona otra hora o profesional.`,
      ),
    );
    expect(backend.posts).toHaveLength(0);
    expect(screen.queryByRole('dialog', { name: 'Procesando tu reserva...' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar Reserva' })).toBeEnabled());
    expect(bookingDialog()).toBeInTheDocument();
  });

  it('proceeds with the booking when the availability check itself fails', async () => {
    const backend = installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await reachReadyToConfirm(user);

    backend.availabilityError = new Error('boom');
    await user.click(confirmButton());

    await screen.findByRole('dialog', { name: '¡Reserva Confirmada!' });
    expect(backend.posts).toHaveLength(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('toasts the server error, closes the loading modal and re-enables the button when the POST fails', async () => {
    const backend = installBackend();
    backend.postResponse = jsonResponse(500, { message: 'Boom' });
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await reachReadyToConfirm(user);

    await user.click(confirmButton());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Error al procesar la reserva: Boom', 5000));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Procesando tu reserva...' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Confirmar Reserva' })).toBeEnabled();
    expect(screen.queryByRole('dialog', { name: '¡Reserva Confirmada!' })).not.toBeInTheDocument();
    expect(bookingDialog()).toBeInTheDocument();

    // After the failure the user can try again.
    backend.postResponse = null;
    await user.click(screen.getByRole('button', { name: 'Confirmar Reserva' }));
    await screen.findByRole('dialog', { name: '¡Reserva Confirmada!' });
    expect(backend.posts).toHaveLength(2);
  });

  it('shows the loading modal and a disabled "Procesando..." button while the POST is in flight', async () => {
    const backend = installBackend();
    let release;
    backend.postGate = new Promise((resolve) => {
      release = resolve;
    });
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await reachReadyToConfirm(user);

    await user.click(confirmButton());

    const loading = await screen.findByRole('dialog', { name: 'Procesando tu reserva...' });
    expect(within(loading).getByText('Por favor espera un momento')).toBeInTheDocument();
    // The booking dialog sits under the loading one (inert), hence `hidden: true`.
    expect(screen.getByRole('button', { name: /Procesando\.\.\./, hidden: true })).toBeDisabled();

    // The legacy "Cerrar" only hides the loading modal; the submission keeps going.
    await user.click(within(loading).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Procesando tu reserva...' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /Procesando\.\.\./ })).toBeDisabled();

    release();
    await screen.findByRole('dialog', { name: '¡Reserva Confirmada!' });
    expect(backend.posts).toHaveLength(1);
  });

  it('sends ONE request when the confirm button is clicked repeatedly', async () => {
    const backend = installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await reachReadyToConfirm(user);

    const button = confirmButton();
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    await screen.findByRole('dialog', { name: '¡Reserva Confirmada!' });
    expect(backend.posts).toHaveLength(1);
  });

  it('sends ONE request on a real double click', async () => {
    const backend = installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await reachReadyToConfirm(user);

    await user.dblClick(confirmButton());

    await screen.findByRole('dialog', { name: '¡Reserva Confirmada!' });
    expect(backend.posts).toHaveLength(1);
  });

  it('escapes user text on the wire but never injects it as markup', async () => {
    const backend = installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await reachReadyToConfirm(user, {
      client: {
        name: '<b>x</b>',
        email: "o'brien&co@example.com",
        notes: '<img src=x onerror=alert(1)> "quoted" & more',
      },
    });

    await user.click(confirmButton());

    const confirmation = await screen.findByRole('dialog', { name: '¡Reserva Confirmada!' });
    const [post] = backend.posts;
    expect(post.body.client.name).toBe('&lt;b&gt;x&lt;/b&gt;');
    expect(post.body.client.email).toBe('o&#x27;brien&amp;co@example.com');
    expect(post.body.notes).toBe('&lt;img src=x onerror=alert(1)&gt; &quot;quoted&quot; &amp; more');
    expect(post.body.client.phone).toBe('+598 98 114 696');

    // Deliberate improvement (c): the confirmation shows the raw typed email, as plain text.
    expect(within(confirmation).getByText("o'brien&co@example.com")).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
  });
});

describe('modal lifecycle', () => {
  it('resets everything when the modal is opened again', async () => {
    installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);

    await chooseService(user, 'Servicio Básico');
    await fillSchedule(user);
    await user.click(nextButton());
    await screen.findByRole('heading', { name: 'Tus Datos' });
    await user.type(screen.getByLabelText('Nombre completo'), 'Juan');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(queryBookingDialog()).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'reopen' }));

    expect(await screen.findByRole('heading', { name: 'Elige tu Servicio' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tus Datos' })).not.toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: /Consulta|Servicio|Sesión/ })) {
      expect(button).toHaveAttribute('aria-pressed', 'false');
    }
    expect(screen.queryByRole('button', { name: /Anterior/ })).not.toBeInTheDocument();

    await chooseService(user, 'Sesión Exprés');
    expect(dateInput()).toHaveValue('');
    expect(timeSelect()).toHaveValue('');
    expect(screen.getByTestId('selected-service-info')).toHaveTextContent('Profesional: No seleccionado');
    await user.click(nextButton());
    expect(toast.error).toHaveBeenLastCalledWith('Por favor selecciona una fecha');

    // The client form was rebuilt too.
    fireEvent.change(dateInput(), { target: { value: MONDAY } });
    // Times belong to a professional: choose one before the time.
    await user.click(professionalCard('Alex García'));
    await within(timeSelect()).findByRole('option', { name: '11:00' });
    await user.selectOptions(timeSelect(), '11:00');
    await user.click(nextButton());
    await screen.findByRole('heading', { name: 'Tus Datos' });
    expect(screen.getByLabelText('Nombre completo')).toHaveValue('');
    expect(screen.getByTestId('client-form')).not.toHaveAttribute('data-validated');
  });

  it('closes with Escape and with the header close button, but not by clicking the backdrop', async () => {
    installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);

    // Static backdrop (legacy data-bs-backdrop="static"): a click on the dimmed area around the
    // dialog box (the full-viewport scroller) keeps it open.
    await user.click(screen.getByTestId('modal-viewport'));
    expect(bookingDialog()).toBeInTheDocument();

    await user.click(within(bookingDialog()).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(queryBookingDialog()).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'reopen' }));
    await screen.findByRole('dialog', { name: 'Reservar tu Cita' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(queryBookingDialog()).not.toBeInTheDocument());
  });

  it('keeps focus inside the dialog and locks the page scroll while it is open', async () => {
    installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);

    const dialog = bookingDialog();
    expect(dialog).toHaveAttribute('aria-labelledby');
    await waitFor(() => expect(dialog).toContainElement(document.activeElement));
    for (let i = 0; i < 6; i += 1) await user.tab();
    expect(dialog).toContainElement(document.activeElement);
    expect(document.documentElement.style.overflow).toBe('hidden');
  });

  it('cannot dismiss the confirmation with Escape (legacy data-bs-keyboard="false")', async () => {
    installBackend();
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await reachReadyToConfirm(user);
    await user.click(confirmButton());
    await screen.findByRole('dialog', { name: '¡Reserva Confirmada!' });

    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: '¡Reserva Confirmada!' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Entendido' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '¡Reserva Confirmada!' })).not.toBeInTheDocument(),
    );
  });
});
