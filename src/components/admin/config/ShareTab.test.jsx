import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_CATALOG } from '../../../test/catalogFixture.js';

vi.mock('../../../services/adminService.js', () => ({ savePublicAvailability: vi.fn() }));
vi.mock('../../../ui/toast.js', () => ({
  toast: { show: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { savePublicAvailability } from '../../../services/adminService.js';
import { toast } from '../../../ui/toast.js';
import ShareTab from './ShareTab.jsx';

const { services } = ADMIN_CATALOG;
const OFF = { enabled: false, days: 7, serviceIds: null };
let onChanged;

function setup(props = {}) {
  onChanged = vi.fn();
  render(<ShareTab publicAvailability={OFF} services={services} onChanged={onChanged} {...props} />);
  return userEvent.setup();
}

beforeEach(() => {
  vi.clearAllMocks();
  savePublicAvailability.mockResolvedValue({ publicAvailability: OFF });
});

describe('ShareTab', () => {
  it('shows the saved settings: off, 7 days, every service', () => {
    setup();

    expect(screen.getByTestId('share-enabled')).not.toBeChecked();
    expect(screen.getByTestId('share-days')).toHaveValue('7');
    expect(screen.getByTestId('share-all-services')).toBeChecked();
    expect(screen.queryByTestId(`share-service-${services[0].id}`)).not.toBeInTheDocument();
  });

  it('shows the public link to /disponibilidad on this site', () => {
    setup();

    expect(screen.getByTestId('share-link')).toHaveValue(`${window.location.origin}/disponibilidad`);
  });

  it('copies the link', async () => {
    const user = setup();
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await user.click(screen.getByRole('button', { name: 'Copiar enlace' }));

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/disponibilidad`);
    expect(toast.success).toHaveBeenCalled();
  });

  it('tells the admin when the link cannot be copied', async () => {
    const user = setup();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true });

    await user.click(screen.getByRole('button', { name: 'Copiar enlace' }));

    expect(toast.error).toHaveBeenCalled();
  });

  it('saves enabled, days and every service (null)', async () => {
    const user = setup();

    await user.click(screen.getByTestId('share-enabled'));
    await user.selectOptions(screen.getByTestId('share-days'), '10');
    await user.click(screen.getByTestId('share-save'));

    await waitFor(() => expect(savePublicAvailability).toHaveBeenCalledWith({ enabled: true, days: 10, serviceIds: null }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(onChanged).toHaveBeenCalled();
  });

  it('lets the admin pick the published services, active ones only', async () => {
    const withInactive = services.map((s, index) => (index === 0 ? { ...s, active: false } : s));
    const user = setup({ services: withInactive });

    // Unchecking "all" starts from every active service selected; the inactive one is not offered.
    await user.click(screen.getByTestId('share-all-services'));
    expect(screen.queryByTestId(`share-service-${services[0].id}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`share-service-${services[1].id}`)).toBeChecked();
    await user.click(screen.getByTestId(`share-service-${services[2].id}`));
    await user.click(screen.getByTestId(`share-service-${services[3].id}`));
    await user.click(screen.getByTestId('share-save'));

    await waitFor(() => expect(savePublicAvailability).toHaveBeenCalledWith({ enabled: false, days: 7, serviceIds: [services[1].id] }));
  });

  it('loads a saved selection of services', () => {
    setup({ publicAvailability: { enabled: true, days: 3, serviceIds: [services[2].id] } });

    expect(screen.getByTestId('share-enabled')).toBeChecked();
    expect(screen.getByTestId('share-days')).toHaveValue('3');
    expect(screen.getByTestId('share-all-services')).not.toBeChecked();
    expect(screen.getByTestId(`share-service-${services[2].id}`)).toBeChecked();
    expect(screen.getByTestId(`share-service-${services[1].id}`)).not.toBeChecked();
  });

  it('refuses to save a selection with no service, without calling the backend', async () => {
    const user = setup({ publicAvailability: { enabled: true, days: 7, serviceIds: [services[1].id] } });

    await user.click(screen.getByTestId(`share-service-${services[1].id}`));
    await user.click(screen.getByTestId('share-save'));

    expect(screen.getByTestId('share-error')).toHaveTextContent('Elige al menos un servicio o publica todos');
    expect(savePublicAvailability).not.toHaveBeenCalled();
  });

  it('shows the backend error and keeps the form', async () => {
    savePublicAvailability.mockRejectedValue(new Error('La cantidad de días debe ser un entero entre 1 y 14.'));
    const user = setup();

    await user.click(screen.getByTestId('share-save'));

    expect(await screen.findByTestId('share-error')).toHaveTextContent('La cantidad de días');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('re-syncs when the parent hands over new settings', () => {
    const { rerender } = render(<ShareTab publicAvailability={OFF} services={services} onChanged={() => {}} />);

    rerender(<ShareTab publicAvailability={{ enabled: true, days: 4, serviceIds: null }} services={services} onChanged={() => {}} />);

    expect(screen.getByTestId('share-enabled')).toBeChecked();
    expect(screen.getByTestId('share-days')).toHaveValue('4');
  });

  it('defaults to the off settings when the catalog carries none (older backend)', () => {
    setup({ publicAvailability: undefined });

    expect(screen.getByTestId('share-enabled')).not.toBeChecked();
    expect(screen.getByTestId('share-days')).toHaveValue('7');
  });
});
