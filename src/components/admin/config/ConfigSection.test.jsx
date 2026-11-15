import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_CATALOG } from '../../../test/catalogFixture.js';

vi.mock('../../../services/adminService.js', () => ({
  getAdminCatalog: vi.fn(),
  createProfessional: vi.fn(),
  updateProfessional: vi.fn(),
  deleteProfessional: vi.fn(),
  createService: vi.fn(),
  updateService: vi.fn(),
  deleteService: vi.fn(),
  saveSchedule: vi.fn(),
}));
vi.mock('../../../ui/toast.js', () => ({
  toast: { show: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { getAdminCatalog } from '../../../services/adminService.js';
import ConfigSection from './ConfigSection.jsx';

beforeEach(() => {
  vi.clearAllMocks();
  getAdminCatalog.mockResolvedValue(ADMIN_CATALOG);
});

describe('ConfigSection', () => {
  it('loads the admin catalog and shows the professionals tab first', async () => {
    render(<ConfigSection />);

    expect(await screen.findByText('Alex García')).toBeInTheDocument();
    expect(getAdminCatalog).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('config-tab-professionals')).toHaveAttribute('aria-selected', 'true');
  });

  it('exposes accessible tabs: tablist, tab, tabpanel and aria-selected', async () => {
    const user = userEvent.setup();
    render(<ConfigSection />);
    await screen.findByText('Alex García');

    const tablist = screen.getByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Profesionales', 'Servicios', 'Horarios']);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('aria-labelledby', tabs[0].id);
    expect(tabs[0]).toHaveAttribute('aria-controls', panel.id);

    await user.click(screen.getByTestId('config-tab-services'));
    expect(screen.getByTestId('config-tab-services')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('config-tab-professionals')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', screen.getByTestId('config-tab-services').id);
    expect(screen.getByText('Servicio Premium')).toBeInTheDocument();

    await user.click(screen.getByTestId('config-tab-schedule'));
    expect(screen.getByTestId('schedule-save')).toBeInTheDocument();
  });

  it('moves between tabs with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<ConfigSection />);
    await screen.findByText('Alex García');

    screen.getByTestId('config-tab-professionals').focus();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByTestId('config-tab-services')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('config-tab-services')).toHaveFocus();
  });

  it('shows an error with a retry button when the catalog cannot be loaded', async () => {
    const user = userEvent.setup();
    getAdminCatalog.mockRejectedValueOnce(new Error('HTTP error! status: 500'));
    render(<ConfigSection />);

    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP error! status: 500');

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Alex García')).toBeInTheDocument();
    expect(getAdminCatalog).toHaveBeenCalledTimes(2);
  });

  it('refreshes the lists after a mutation', async () => {
    const user = userEvent.setup();
    const { createProfessional } = await import('../../../services/adminService.js');
    createProfessional.mockResolvedValue({ id: 'ana', name: 'Ana', active: true });
    render(<ConfigSection />);
    await screen.findByText('Alex García');

    getAdminCatalog.mockResolvedValue({
      ...ADMIN_CATALOG,
      professionals: [...ADMIN_CATALOG.professionals, { id: 'ana', name: 'Ana Nueva', specialty: 'x', experience: '1', active: true }],
    });
    await user.click(screen.getByRole('button', { name: /Nuevo profesional/ }));
    await user.type(screen.getByTestId('professional-name-input'), 'Ana Nueva');
    await user.click(screen.getByTestId('professional-save'));

    await waitFor(() => expect(screen.getByText('Ana Nueva')).toBeInTheDocument());
    expect(getAdminCatalog).toHaveBeenCalledTimes(2);
  });
});
