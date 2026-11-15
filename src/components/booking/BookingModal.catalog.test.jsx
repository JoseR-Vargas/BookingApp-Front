import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG } from '../../test/catalogFixture.js';

vi.mock('../../services/catalogService.js', () => ({ getCatalog: vi.fn() }));
vi.mock('../../ui/toast.js', () => ({
  toast: { show: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { getCatalog } from '../../services/catalogService.js';
import { BookingProvider } from '../../state/bookingState.jsx';
import { CatalogProvider } from '../../state/catalogState.jsx';
import { CatalogTestProvider } from '../../test/CatalogTestProvider.jsx';
import BookingModal from './BookingModal.jsx';

vi.setConfig({ testTimeout: 20000 });

const nextButton = () => screen.getByRole('button', { name: /Siguiente/ });

function renderWithRealProvider() {
  return render(
    <CatalogProvider>
      <BookingProvider>
        <BookingModal open onClose={() => {}} />
      </BookingProvider>
    </CatalogProvider>,
  );
}

beforeEach(() => {
  getCatalog.mockReset();
});

describe('BookingModal catalog states', () => {
  it('shows a loading message instead of the steps while the catalog loads', () => {
    getCatalog.mockReturnValue(new Promise(() => {}));

    renderWithRealProvider();

    expect(screen.getByText('Cargando servicios...')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Elige tu Servicio' })).not.toBeInTheDocument();
    expect(nextButton()).toBeDisabled();
  });

  it('shows the error with a "Reintentar" button when the catalog fails, and recovers on retry', async () => {
    const user = userEvent.setup({ delay: null });
    getCatalog.mockRejectedValueOnce(new Error('HTTP error! status: 500')).mockResolvedValueOnce(CATALOG);

    renderWithRealProvider();

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los servicios');
    expect(nextButton()).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('heading', { name: 'Elige tu Servicio' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await waitFor(() => expect(nextButton()).toBeEnabled());
    expect(screen.getByRole('button', { name: /Servicio Básico/ })).toBeInTheDocument();
    expect(getCatalog).toHaveBeenCalledTimes(2);
  });

  it('"Reintentar" calls the catalog reload', async () => {
    const user = userEvent.setup({ delay: null });
    const reload = vi.fn();

    render(
      <CatalogTestProvider value={{ status: 'error', professionals: [], services: [], schedule: null, reload }}>
        <BookingProvider>
          <BookingModal open onClose={() => {}} />
        </BookingProvider>
      </CatalogTestProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('renders the services of the catalog once ready (no hardcoded data)', async () => {
    getCatalog.mockResolvedValue({
      ...CATALOG,
      services: [{ ...CATALOG.services[0], id: 'corte', name: 'Corte Nuevo', price: 999, duration: 45 }],
    });

    renderWithRealProvider();

    expect(await screen.findByRole('button', { name: /Corte Nuevo/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Servicio Premium/ })).not.toBeInTheDocument();
  });
});
