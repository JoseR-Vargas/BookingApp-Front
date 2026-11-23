import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogTestProvider } from '../../test/CatalogTestProvider.jsx';

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
import { BookingProvider } from '../../state/bookingState.jsx';
import BookingModal from './BookingModal.jsx';

vi.setConfig({ testTimeout: 20000 });

const DATE = '2030-01-07'; // a Monday
const PREFILL = { serviceId: 'servicio-basico', date: DATE, time: '12:00', professionalId: 'maria-lopez' };

function Harness({ prefill }) {
  const [open, setOpen] = useState(true);
  return (
    <CatalogTestProvider>
      <BookingProvider>
        <button type="button" onClick={() => setOpen(true)}>reopen</button>
        <BookingModal open={open} onClose={() => setOpen(false)} prefill={prefill} />
      </BookingProvider>
    </CatalogTestProvider>
  );
}

beforeEach(() => {
  getAvailability.mockResolvedValue({
    date: DATE,
    closed: false,
    professionals: [
      { id: 'alex-garcia', name: 'Alex García', slots: ['10:00'] },
      { id: 'maria-lopez', name: 'María López', slots: ['12:00', '13:00'] },
    ],
  });
  checkAvailability.mockResolvedValue(true);
  createBooking.mockResolvedValue({ cancelToken: 'tok' });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('BookingModal prefill', () => {
  it('opens straight on "Tus Datos" with the service, date, time and professional already chosen', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness prefill={PREFILL} />);

    expect(await screen.findByRole('heading', { name: 'Tus Datos' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Anterior' }));
    const info = await screen.findByTestId('selected-service-info');
    expect(info).toHaveTextContent('Servicio Básico');
    expect(info).toHaveTextContent('María López');
    expect(info).toHaveTextContent('12:00');
    expect(screen.getByLabelText('Fecha de la cita')).toHaveValue(DATE);
  });

  it('books exactly what was prefilled', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness prefill={PREFILL} />);
    await screen.findByRole('heading', { name: 'Tus Datos' });

    await user.type(screen.getByLabelText('Nombre completo'), 'Juan Pérez');
    await user.type(screen.getByLabelText('Dirección de email'), 'juan@example.com');
    await user.type(screen.getByLabelText('Número de teléfono'), '+598 98 114 696');
    await user.click(screen.getByRole('checkbox', { name: /Acepto los/ }));
    await user.click(screen.getByRole('button', { name: /Confirmar Reserva/ }));

    await waitFor(() => expect(createBooking).toHaveBeenCalledTimes(1));
    expect(checkAvailability).toHaveBeenCalledWith(DATE, '12:00', 'maria-lopez', ['servicio-basico']);
    const payload = createBooking.mock.calls[0][0];
    expect(payload).toMatchObject({ date: DATE, time: '12:00', professional: { id: 'maria-lopez' }, services: [{ id: 'servicio-basico' }] });
  });

  it('applies the prefill again on every opening', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness prefill={PREFILL} />);
    await screen.findByRole('heading', { name: 'Tus Datos' });

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Reservar tu Cita' })).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'reopen' }));

    expect(await screen.findByRole('heading', { name: 'Tus Datos' })).toBeVisible();
  });

  it('ignores a prefill whose service or professional is not in the catalog, starting at step 1', async () => {
    render(<Harness prefill={{ ...PREFILL, professionalId: 'ghost' }} />);

    expect(await screen.findByRole('heading', { name: 'Elige tu Servicio' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Tus Datos' })).not.toBeInTheDocument(); // hidden steps are not exposed
  });

  it('without a prefill starts at step 1 as always', async () => {
    render(<Harness />);

    expect(await screen.findByRole('heading', { name: 'Elige tu Servicio' })).toBeVisible();
  });
});
