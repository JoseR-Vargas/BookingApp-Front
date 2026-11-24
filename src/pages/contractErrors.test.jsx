// SPEC 16: a backend answer that breaks the contract is handled like any other load failure (the
// error state with "Reintentar", or the availability fallback), never a blank screen. The REAL
// services, schemas and providers run; only the network is faked.
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ui/toast.js', () => ({
  toast: { show: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('socket.io-client', () => ({ io: vi.fn() }));

import BookingModal from '../components/booking/BookingModal.jsx';
import { useAvailableTimes } from '../hooks/useAvailableTimes.js';
import { BookingProvider } from '../state/bookingState.jsx';
import { CatalogProvider } from '../state/catalogState.jsx';
import { CATALOG } from '../test/catalogFixture.js';
import { installMockHttp, restoreHttp } from '../test/mockHttp.js';
import { toast } from '../ui/toast.js';
import Availability from './Availability.jsx';

vi.setConfig({ testTimeout: 20000 });

const ok = (data) => ({ ok: true, status: 200, json: async () => data });
const BROKEN_CATALOG = { professionals: CATALOG.professionals, services: CATALOG.services };

let httpMock;
let routes;

beforeEach(() => {
  routes = {};
  httpMock = installMockHttp(async (url) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    if (!(path in routes)) throw new Error(`Unexpected request ${path}`);
    const answer = routes[path];
    return ok(typeof answer === 'function' ? answer() : answer);
  });
});

afterEach(() => {
  restoreHttp();
  vi.clearAllMocks();
});

describe('a malformed catalog', () => {
  it('shows the booking modal error with "Reintentar" and recovers once the backend answers well', async () => {
    const user = userEvent.setup({ delay: null });
    const answers = [BROKEN_CATALOG, CATALOG];
    routes['/api/catalog'] = () => answers.shift();

    render(
      <CatalogProvider>
        <BookingProvider>
          <BookingModal open onClose={() => {}} />
        </BookingProvider>
      </CatalogProvider>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los servicios');

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('heading', { name: 'Elige tu Servicio' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('a malformed /disponibilidad answer', () => {
  it('shows the page error with "Reintentar" instead of a blank page, and recovers on retry', async () => {
    const user = userEvent.setup({ delay: null });
    const answers = [{ enabled: true, services: [] }, { enabled: false }];
    routes['/api/catalog'] = CATALOG;
    routes['/api/public-availability'] = () => answers.shift();

    render(<MemoryRouter><Availability /></MemoryRouter>);

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los turnos');

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Esta página no está disponible por ahora.')).toBeInTheDocument();
  });
});

describe('a malformed availability answer in the booking flow', () => {
  it('is not retried: the existing failure fallback and warning apply', async () => {
    routes['/api/availability'] = { date: '2030-01-07', closed: false };

    const { result } = renderHook(() => useAvailableTimes('2030-01-07', 'alex-garcia', ['servicio-basico']));

    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(httpMock).toHaveBeenCalledTimes(1);
  });
});
