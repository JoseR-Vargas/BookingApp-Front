import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEDULE } from '../../../test/catalogFixture.js';

vi.mock('../../../services/adminService.js', () => ({ createLocation: vi.fn(), updateLocation: vi.fn() }));
vi.mock('../../../ui/toast.js', () => ({
  toast: { show: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { createLocation, updateLocation } from '../../../services/adminService.js';
import { toast } from '../../../ui/toast.js';
import LocationsTab from './LocationsTab.jsx';

const LOCATIONS = [
  { id: 'principal', name: 'Principal', address: 'Calle 1', active: true, schedule: SCHEDULE },
  { id: 'centro', name: 'Centro', address: '', active: true, schedule: SCHEDULE },
];
let onChanged;

function setup(locations = LOCATIONS) {
  onChanged = vi.fn();
  render(<LocationsTab locations={locations} onChanged={onChanged} />);
  return userEvent.setup();
}

beforeEach(() => {
  vi.clearAllMocks();
  createLocation.mockResolvedValue({});
  updateLocation.mockResolvedValue({});
});

describe('LocationsTab list', () => {
  it('lists each location with its address and state', () => {
    setup([...LOCATIONS, { id: 'viejo', name: 'Viejo', address: 'X', active: false, schedule: SCHEDULE }]);

    const principal = screen.getByTestId('location-row-principal');
    expect(within(principal).getByText('Principal')).toBeInTheDocument();
    expect(within(principal).getByText('Calle 1')).toBeInTheDocument();
    expect(within(principal).getByText('Activo')).toBeInTheDocument();
    expect(within(screen.getByTestId('location-row-viejo')).getByText('Inactivo')).toBeInTheDocument();
  });
});

describe('LocationsTab create and edit', () => {
  it('creates a location with name and address', async () => {
    const user = setup();

    await user.click(screen.getByRole('button', { name: 'Nuevo local' }));
    await user.type(screen.getByTestId('location-name-input'), '  Playa ');
    await user.type(screen.getByTestId('location-address-input'), 'Rambla 5');
    await user.click(screen.getByTestId('location-save'));

    await waitFor(() => expect(createLocation).toHaveBeenCalledWith({ name: 'Playa', address: 'Rambla 5' }));
    expect(toast.success).toHaveBeenCalledWith('Local creado');
    expect(onChanged).toHaveBeenCalled();
  });

  it('requires a name without calling the backend', async () => {
    const user = setup();

    await user.click(screen.getByRole('button', { name: 'Nuevo local' }));
    await user.click(screen.getByTestId('location-save'));

    expect(screen.getByTestId('location-error')).toHaveTextContent('El nombre es obligatorio');
    expect(createLocation).not.toHaveBeenCalled();
  });

  it('edits the name and address keeping the active state', async () => {
    const user = setup();

    await user.click(screen.getByTestId('location-edit-centro'));
    expect(screen.getByTestId('location-name-input')).toHaveValue('Centro');
    await user.type(screen.getByTestId('location-address-input'), 'Av. 18');
    await user.click(screen.getByTestId('location-save'));

    await waitFor(() => expect(updateLocation).toHaveBeenCalledWith('centro', { name: 'Centro', address: 'Av. 18', active: true }));
    expect(toast.success).toHaveBeenCalledWith('Local actualizado');
  });

  it('shows the backend error and keeps the form open', async () => {
    createLocation.mockRejectedValue(new Error('La dirección del local no puede superar los 200 caracteres.'));
    const user = setup();

    await user.click(screen.getByRole('button', { name: 'Nuevo local' }));
    await user.type(screen.getByTestId('location-name-input'), 'Playa');
    await user.click(screen.getByTestId('location-save'));

    expect(await screen.findByTestId('location-error')).toHaveTextContent('La dirección del local');
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe('LocationsTab activate and deactivate', () => {
  it('deactivates after asking, sending the rest of the data unchanged', async () => {
    const user = setup();

    await user.click(screen.getByTestId('location-toggle-centro'));
    expect(updateLocation).not.toHaveBeenCalled();
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => expect(updateLocation).toHaveBeenCalledWith('centro', { name: 'Centro', address: '', active: false }));
    expect(toast.success).toHaveBeenCalledWith('Local desactivado');
    expect(onChanged).toHaveBeenCalled();
  });

  it('activates a deactivated one without asking', async () => {
    const user = setup([...LOCATIONS, { id: 'viejo', name: 'Viejo', address: 'X', active: false, schedule: SCHEDULE }]);

    await user.click(screen.getByTestId('location-toggle-viejo'));

    await waitFor(() => expect(updateLocation).toHaveBeenCalledWith('viejo', { name: 'Viejo', address: 'X', active: true }));
    expect(toast.success).toHaveBeenCalledWith('Local activado');
  });

  it('explains the refusal when the backend will not deactivate the last active location', async () => {
    updateLocation.mockRejectedValue(new Error('Debe quedar al menos un local activo.'));
    const user = setup();

    await user.click(screen.getByTestId('location-toggle-principal'));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Debe quedar al menos un local activo.'));
    expect(onChanged).not.toHaveBeenCalled();
  });
});
