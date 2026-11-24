import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG } from '../test/catalogFixture.js';

vi.mock('../services/publicAvailabilityService.js', () => ({ getPublicAvailability: vi.fn() }));
vi.mock('../services/catalogService.js', () => ({ getCatalog: vi.fn() }));
vi.mock('../components/booking/BookingModal.jsx', () => ({
  default: ({ open, onClose, prefill }) => (open ? (
    <div role="dialog" aria-label="Reservar tu Cita">
      <span data-testid="prefill">{JSON.stringify(prefill)}</span>
      <button type="button" onClick={onClose}>cerrar reserva</button>
    </div>
  ) : null),
}));

import { getCatalog } from '../services/catalogService.js';
import { getPublicAvailability } from '../services/publicAvailabilityService.js';
import Availability from './Availability.jsx';

const ALEX = { id: 'alex-garcia', name: 'Alex García' };
const MARIA = { id: 'maria-lopez', name: 'María López' };
const SERVICES = [
  { id: 'consulta-inicial', name: 'Consulta Inicial', duration: 30 },
  { id: 'servicio-basico', name: 'Servicio Básico', duration: 60 },
];

const answer = (overrides = {}) => ({
  enabled: true,
  services: SERVICES,
  serviceId: 'consulta-inicial',
  days: [
    { date: '2030-01-07', closed: false, times: [{ time: '09:00', professionals: [ALEX] }, { time: '10:00', professionals: [ALEX, MARIA] }] },
    { date: '2030-01-08', closed: true, times: [] },
    { date: '2030-01-09', closed: false, times: [] },
  ],
  ...overrides,
});

function setup() {
  render(<MemoryRouter><Availability /></MemoryRouter>);
  return userEvent.setup();
}

beforeEach(() => {
  vi.clearAllMocks();
  getCatalog.mockResolvedValue(CATALOG);
  getPublicAvailability.mockResolvedValue(answer());
});

describe('Availability page', () => {
  it('says the page is not available while the admin has it off', async () => {
    getPublicAvailability.mockResolvedValue({ enabled: false });
    setup();

    expect(await screen.findByText('Esta página no está disponible por ahora.')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('lists each day with its free times; a closed day says "Cerrado" and an empty one "Sin turnos"', async () => {
    setup();

    expect(await screen.findByRole('heading', { name: 'Turnos disponibles' })).toBeInTheDocument();
    const monday = screen.getByTestId('availability-day-2030-01-07');
    expect(within(monday).getByText(/Lunes 7 ene/)).toBeInTheDocument();
    expect(within(monday).getAllByRole('button').map((b) => b.textContent)).toEqual(['09:00', '10:00']);
    expect(screen.getByTestId('availability-day-2030-01-08')).toHaveTextContent('Cerrado');
    expect(screen.getByTestId('availability-day-2030-01-09')).toHaveTextContent('Sin turnos');
  });

  it('offers the published services and reloads for the one chosen', async () => {
    const user = setup();
    await screen.findByRole('radiogroup', { name: 'Servicio' });
    expect(screen.getByRole('radio', { name: /Consulta Inicial/ })).toBeChecked();

    getPublicAvailability.mockResolvedValue(answer({ serviceId: 'servicio-basico' }));
    await user.click(screen.getByRole('radio', { name: /Servicio Básico/ }));

    await waitFor(() => expect(getPublicAvailability).toHaveBeenLastCalledWith('servicio-basico'));
    await waitFor(() => expect(screen.getByRole('radio', { name: /Servicio Básico/ })).toBeChecked());
  });

  it('books straight away when only one professional is free at the tapped time', async () => {
    const user = setup();

    await user.click(await screen.findByRole('button', { name: '09:00' }));

    expect(JSON.parse(screen.getByTestId('prefill').textContent)).toEqual({
      serviceId: 'consulta-inicial',
      date: '2030-01-07',
      time: '09:00',
      professionalId: 'alex-garcia',
    });
    expect(screen.queryByRole('dialog', { name: '¿Con quién quieres reservar?' })).not.toBeInTheDocument();
  });

  it('asks which of the free professionals to book with when there are several', async () => {
    const user = setup();

    await user.click(await screen.findByRole('button', { name: '10:00' }));

    const picker = screen.getByRole('dialog', { name: '¿Con quién quieres reservar?' });
    expect(within(picker).getAllByRole('button').map((b) => b.textContent)).toEqual(['Alex García', 'María López', 'Cancelar']);
    expect(screen.queryByTestId('prefill')).not.toBeInTheDocument();

    await user.click(within(picker).getByRole('button', { name: 'María López' }));

    expect(JSON.parse(screen.getByTestId('prefill').textContent)).toMatchObject({ time: '10:00', professionalId: 'maria-lopez' });
  });

  it('can cancel the professional picker without booking', async () => {
    const user = setup();
    await user.click(await screen.findByRole('button', { name: '10:00' }));

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '¿Con quién quieres reservar?' })).not.toBeInTheDocument());
    expect(screen.queryByTestId('prefill')).not.toBeInTheDocument();
  });

  it('reloads the free times when the booking dialog closes (the booked time must disappear)', async () => {
    const user = setup();
    await user.click(await screen.findByRole('button', { name: '09:00' }));
    expect(getPublicAvailability).toHaveBeenCalledTimes(1);

    getPublicAvailability.mockResolvedValue(answer({
      days: [{ date: '2030-01-07', closed: false, times: [{ time: '10:00', professionals: [ALEX, MARIA] }] }],
    }));
    await user.click(screen.getByRole('button', { name: 'cerrar reserva' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: '09:00' })).not.toBeInTheDocument());
    expect(getPublicAvailability).toHaveBeenCalledTimes(2);
  });

  it('shows an error with a retry button when the lookup fails', async () => {
    getPublicAvailability.mockRejectedValueOnce(new Error('HTTP error! status: 500'));
    const user = setup();

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los turnos');

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('button', { name: '09:00' })).toBeInTheDocument();
  });

  it('says there are no services to show when none is published', async () => {
    getPublicAvailability.mockResolvedValue(answer({ services: [], serviceId: null, days: [] }));
    setup();

    expect(await screen.findByText('Todavía no hay turnos para mostrar.')).toBeInTheDocument();
  });
});

describe('Availability page with several locations (SPEC 08)', () => {
  const LOCATIONS = [{ id: 'principal', name: 'Principal' }, { id: 'centro', name: 'Centro' }];

  it('shows no location chooser when the business has one', async () => {
    getPublicAvailability.mockResolvedValue(answer({ locations: [LOCATIONS[0]], locationId: 'principal' }));
    setup();

    await screen.findByRole('button', { name: '09:00' });
    expect(screen.queryByRole('radiogroup', { name: 'Local' })).not.toBeInTheDocument();
  });

  it('offers the locations and reloads the times for the one chosen, keeping the service', async () => {
    getPublicAvailability.mockResolvedValue(answer({ locations: LOCATIONS, locationId: 'principal' }));
    const user = setup();
    await screen.findByRole('radiogroup', { name: 'Local' });
    expect(screen.getByRole('radio', { name: 'Principal' })).toBeChecked();

    getPublicAvailability.mockResolvedValue(answer({ locations: LOCATIONS, locationId: 'centro' }));
    await user.click(screen.getByRole('radio', { name: 'Centro' }));

    await waitFor(() => expect(getPublicAvailability).toHaveBeenLastCalledWith('consulta-inicial', 'centro'));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Centro' })).toBeChecked());
  });

  it('books with the location of the page', async () => {
    getPublicAvailability.mockResolvedValue(answer({ locations: LOCATIONS, locationId: 'centro' }));
    const user = setup();

    await user.click(await screen.findByRole('button', { name: '09:00' }));

    expect(JSON.parse(screen.getByTestId('prefill').textContent)).toMatchObject({ locationId: 'centro', time: '09:00' });
  });

  it('does not send a location the visitor did not choose', async () => {
    setup();
    await screen.findByRole('button', { name: '09:00' });

    expect(getPublicAvailability).toHaveBeenCalledWith(undefined);
  });
});
