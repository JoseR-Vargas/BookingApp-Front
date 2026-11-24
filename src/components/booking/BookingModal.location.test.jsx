import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogTestProvider } from '../../test/CatalogTestProvider.jsx';
import { PROFESSIONALS, SCHEDULE } from '../../test/catalogFixture.js';

vi.mock('../../ui/toast.js', () => ({
  toast: { show: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('../../services/bookingService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getAvailability: vi.fn(),
  checkAvailability: vi.fn(),
  createBooking: vi.fn(),
}));

import { checkAvailability, createBooking, getAvailability } from '../../services/bookingService.js';
import { toast } from '../../ui/toast.js';
import { BookingProvider } from '../../state/bookingState.jsx';
import BookingModal from './BookingModal.jsx';

vi.setConfig({ testTimeout: 20000 });

const DATE = '2030-01-07'; // a Monday
const LOCATIONS = [
  { id: 'principal', name: 'Principal', address: 'Calle 1', schedule: SCHEDULE },
  { id: 'centro', name: 'Centro', address: 'Av. 18', schedule: SCHEDULE },
];
// Alex rotates between both locations; María works at Principal only.
const ROTATING = PROFESSIONALS.map((p) => ({ ...p, locations: p.id === 'alex-garcia' ? ['principal', 'centro'] : ['principal'] }));

function Harness({ catalog, prefill }) {
  const [open, setOpen] = useState(true);
  return (
    <CatalogTestProvider value={catalog}>
      <BookingProvider>
        <BookingModal open={open} onClose={() => setOpen(false)} prefill={prefill} />
      </BookingProvider>
    </CatalogTestProvider>
  );
}

const TWO = { locations: LOCATIONS, professionals: ROTATING };
const card = (name) => screen.getByRole('button', { name: new RegExp(name) });

beforeEach(() => {
  getAvailability.mockResolvedValue({
    date: DATE,
    closed: false,
    professionals: [
      { id: 'alex-garcia', name: 'Alex García', slots: ['10:00', '11:00'] },
      { id: 'maria-lopez', name: 'María López', slots: ['10:00'] },
    ],
  });
  checkAvailability.mockResolvedValue(true);
  createBooking.mockResolvedValue({});
});

afterEach(() => {
  vi.clearAllMocks();
});

async function toScheduleStep(user) {
  await user.click(await screen.findByRole('button', { name: /Servicio Básico/ }));
  await user.click(screen.getByRole('button', { name: /Siguiente/ }));
  await screen.findByRole('heading', { name: 'Fecha y Hora' });
}

describe('BookingModal with a single location', () => {
  it('shows no location chooser and sends no location anywhere', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await toScheduleStep(user);

    expect(screen.queryByRole('radiogroup', { name: 'Local' })).not.toBeInTheDocument();
    await user.click(card('Alex García'));
    await waitFor(() => expect(screen.getByLabelText('Fecha de la cita')).toBeInTheDocument());
  });
});

describe('BookingModal with several locations', () => {
  it('asks for the location first and hides the professionals until one is chosen', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness catalog={TWO} />);
    await toScheduleStep(user);

    const group = screen.getByRole('radiogroup', { name: 'Local' });
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Principal'), expect.stringContaining('Centro')]));
    expect(screen.getByText('Elige un local para ver los profesionales')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Alex García/ })).not.toBeInTheDocument();
  });

  it('shows only the professionals who work at the chosen location', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness catalog={TWO} />);
    await toScheduleStep(user);

    await user.click(screen.getByRole('radio', { name: /Centro/ }));
    expect(screen.getByRole('button', { name: /Alex García/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /María López/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /Principal/ }));
    expect(screen.getByRole('button', { name: /Alex García/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /María López/ })).toBeInTheDocument();
  });

  it('asks the backend for the hours of the chosen location', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness catalog={TWO} />);
    await toScheduleStep(user);
    await user.click(screen.getByRole('radio', { name: /Centro/ }));
    await user.click(screen.getByRole('button', { name: /Alex García/ }));
    const date = screen.getByLabelText('Fecha de la cita');
    date.value = DATE;
    date.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => expect(getAvailability).toHaveBeenCalled());
    expect(getAvailability).toHaveBeenLastCalledWith(DATE, ['servicio-basico'], expect.objectContaining({ locationId: 'centro' }));
  });

  it('will not go on without a location', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness catalog={TWO} />);
    await toScheduleStep(user);

    await user.click(screen.getByRole('button', { name: /Siguiente/ }));

    expect(toast.error).toHaveBeenCalledWith('Por favor selecciona un local');
    expect(screen.queryByRole('heading', { name: 'Tus Datos' })).not.toBeInTheDocument();
  });

  it('books with the location: pre-check, payload and confirmation', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness catalog={TWO} prefill={{ serviceId: 'servicio-basico', date: DATE, time: '11:00', professionalId: 'alex-garcia', locationId: 'centro' }} />);
    await screen.findByRole('heading', { name: 'Tus Datos' });

    await user.type(screen.getByLabelText('Nombre completo'), 'Juan Pérez');
    await user.type(screen.getByLabelText('Dirección de email'), 'juan@example.com');
    await user.type(screen.getByLabelText('Número de teléfono'), '+598 98 114 696');
    await user.click(screen.getByRole('checkbox', { name: /Acepto los/ }));
    await user.click(screen.getByRole('button', { name: /Confirmar Reserva/ }));

    await waitFor(() => expect(createBooking).toHaveBeenCalledTimes(1));
    expect(checkAvailability).toHaveBeenCalledWith(DATE, '11:00', 'alex-garcia', ['servicio-basico'], 'centro');
    expect(createBooking.mock.calls[0][0]).toMatchObject({ location: { id: 'centro' }, professional: { id: 'alex-garcia' }, time: '11:00' });
    const confirmation = await screen.findByRole('dialog', { name: '¡Reserva Confirmada!' });
    expect(within(confirmation).getByText('Centro')).toBeInTheDocument();
  });

  it('ignores a prefill that carries no location when there are several (starts at step 1)', async () => {
    render(<Harness catalog={TWO} prefill={{ serviceId: 'servicio-basico', date: DATE, time: '11:00', professionalId: 'alex-garcia' }} />);

    expect(await screen.findByRole('heading', { name: 'Elige tu Servicio' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Tus Datos' })).not.toBeInTheDocument();
  });
});
