import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_CATALOG } from '../../../test/catalogFixture.js';
import { formatMoney } from '../../../utils/format.js';

vi.mock('../../../services/adminService.js', () => ({
  createService: vi.fn(),
  updateService: vi.fn(),
  deleteService: vi.fn(),
  deleteServicePermanently: vi.fn(),
}));
vi.mock('../../../ui/toast.js', () => ({
  toast: { show: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { createService, deleteService, deleteServicePermanently, updateService } from '../../../services/adminService.js';
import { toast } from '../../../ui/toast.js';
import ServicesTab from './ServicesTab.jsx';

const professionals = [
  ...ADMIN_CATALOG.professionals,
  { id: 'inactivo', name: 'Pedro Pausa', specialty: 'Ex', experience: '2 años', active: false },
];

const services = [
  ...ADMIN_CATALOG.services.slice(0, 2),
  { id: 'huerfano', name: 'Servicio Huérfano', description: 'd', price: 100, duration: 30, professionals: ['inactivo'], icon: 'x', active: true },
  { id: 'viejo', name: 'Servicio Viejo', description: 'd', price: 100, duration: 30, professionals: ['alex-garcia'], icon: 'x', active: false },
];

let onChanged;

function setup() {
  onChanged = vi.fn();
  render(<ServicesTab services={services} professionals={professionals} onChanged={onChanged} />);
  return userEvent.setup();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ServicesTab list', () => {
  it('lists name, price, duration, professional names and the active badge', () => {
    setup();

    const row = screen.getByTestId('service-row-servicio-basico');
    expect(within(row).getByText('Servicio Básico')).toBeInTheDocument();
    expect(within(row).getByText(formatMoney(1200))).toBeInTheDocument();
    expect(within(row).getByText('60 min')).toBeInTheDocument();
    expect(within(row).getByText('Alex García, María López')).toBeInTheDocument();
    expect(within(row).getByText('Activo')).toBeInTheDocument();
    expect(within(screen.getByTestId('service-row-viejo')).getByText('Inactivo')).toBeInTheDocument();
  });

  it('flags a service whose professionals are all inactive', () => {
    setup();

    expect(within(screen.getByTestId('service-row-huerfano')).getByText('Sin profesionales activos')).toBeInTheDocument();
    expect(within(screen.getByTestId('service-row-servicio-basico')).queryByText('Sin profesionales activos')).not.toBeInTheDocument();
  });
});

describe('ServicesTab create', () => {
  async function openForm(user) {
    await user.click(screen.getByRole('button', { name: /Nuevo servicio/ }));
  }

  it('has labels bound to every control', async () => {
    const user = setup();
    await openForm(user);

    expect(screen.getByLabelText('Nombre')).toBe(screen.getByTestId('service-name-input'));
    expect(screen.getByLabelText('Descripción')).toBe(screen.getByTestId('service-description-input'));
    expect(screen.getByLabelText('Precio')).toBe(screen.getByTestId('service-price-input'));
    expect(screen.getByLabelText('Duración (minutos)')).toBe(screen.getByTestId('service-duration-input'));
    expect(screen.getByRole('checkbox', { name: 'Alex García' })).toBeInTheDocument();
  });

  it('posts numbers and the chosen professionals ids, then refreshes', async () => {
    const user = setup();
    createService.mockResolvedValue({ id: 'corte' });
    await openForm(user);

    await user.type(screen.getByTestId('service-name-input'), 'Corte Prueba');
    await user.type(screen.getByTestId('service-description-input'), 'Corte de prueba');
    await user.type(screen.getByTestId('service-price-input'), '850');
    await user.type(screen.getByTestId('service-duration-input'), '45');
    await user.click(screen.getByRole('checkbox', { name: 'María López' }));
    await user.click(screen.getByTestId('service-save'));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(createService).toHaveBeenCalledWith({
      name: 'Corte Prueba',
      description: 'Corte de prueba',
      price: 850,
      duration: 45,
      professionals: ['maria-lopez'],
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it('asks for a name, a price, a duration and at least one professional before calling the backend', async () => {
    const user = setup();
    await openForm(user);

    await user.click(screen.getByTestId('service-save'));
    expect(screen.getByRole('alert')).toHaveTextContent('El nombre es obligatorio');

    await user.type(screen.getByTestId('service-name-input'), 'X');
    await user.click(screen.getByTestId('service-save'));
    expect(screen.getByRole('alert')).toHaveTextContent('Ingresa el precio');

    await user.type(screen.getByTestId('service-price-input'), '10');
    await user.click(screen.getByTestId('service-save'));
    expect(screen.getByRole('alert')).toHaveTextContent('Ingresa la duración');

    await user.type(screen.getByTestId('service-duration-input'), '30');
    await user.click(screen.getByTestId('service-save'));
    expect(screen.getByRole('alert')).toHaveTextContent('Selecciona al menos un profesional');

    expect(createService).not.toHaveBeenCalled();
  });

  it('shows the backend message when the duration is out of range', async () => {
    const user = setup();
    createService.mockRejectedValue(new Error('duration must be an integer between 5 and 480'));
    await openForm(user);

    await user.type(screen.getByTestId('service-name-input'), 'Largo');
    await user.type(screen.getByTestId('service-price-input'), '10');
    await user.type(screen.getByTestId('service-duration-input'), '500');
    await user.click(screen.getByRole('checkbox', { name: 'Alex García' }));
    await user.click(screen.getByTestId('service-save'));

    expect(await screen.findByRole('alert')).toHaveTextContent('duration must be an integer between 5 and 480');
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByTestId('service-save')).toBeEnabled();
  });

  it('disables the save button with a spinner label while saving', async () => {
    const user = setup();
    createService.mockImplementation(() => new Promise(() => {}));
    await openForm(user);
    await user.type(screen.getByTestId('service-name-input'), 'Lento');
    await user.type(screen.getByTestId('service-price-input'), '10');
    await user.type(screen.getByTestId('service-duration-input'), '30');
    await user.click(screen.getByRole('checkbox', { name: 'Alex García' }));
    await user.click(screen.getByTestId('service-save'));

    expect(screen.getByTestId('service-save')).toBeDisabled();
    expect(screen.getByTestId('service-save')).toHaveTextContent('Guardando...');
  });
});

describe('ServicesTab edit and activation', () => {
  it('prefills the form and sends the update', async () => {
    const user = setup();
    updateService.mockResolvedValue({});
    await user.click(screen.getByTestId('service-edit-servicio-basico'));

    expect(screen.getByTestId('service-name-input')).toHaveValue('Servicio Básico');
    expect(screen.getByTestId('service-price-input')).toHaveValue(1200);
    expect(screen.getByTestId('service-duration-input')).toHaveValue(60);
    expect(screen.getByRole('checkbox', { name: 'Alex García' })).toBeChecked();

    await user.clear(screen.getByTestId('service-price-input'));
    await user.type(screen.getByTestId('service-price-input'), '1500');
    await user.click(screen.getByRole('checkbox', { name: 'María López' }));
    await user.click(screen.getByTestId('service-save'));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(updateService).toHaveBeenCalledWith('servicio-basico', {
      name: 'Servicio Básico',
      description: 'Atención estándar completa con seguimiento profesional',
      price: 1500,
      duration: 60,
      professionals: ['alex-garcia'],
    });
  });

  it('deactivates an active service and reactivates an inactive one', async () => {
    const user = setup();
    deleteService.mockResolvedValue({});
    updateService.mockResolvedValue({});

    await user.click(screen.getByTestId('service-toggle-servicio-basico'));
    await waitFor(() => expect(deleteService).toHaveBeenCalledWith('servicio-basico'));

    await user.click(screen.getByTestId('service-toggle-viejo'));
    await waitFor(() => expect(updateService).toHaveBeenCalledWith('viejo', { active: true }));
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('toasts the backend error when the activation fails', async () => {
    const user = setup();
    deleteService.mockRejectedValue(new Error('Service not found'));

    await user.click(screen.getByTestId('service-toggle-servicio-basico'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Service not found'));
  });
});


describe('ServicesTab permanent delete', () => {
  const clickDelete = (user, id) => user.click(screen.getByTestId(`service-delete-${id}`));
  const dialog = () => screen.getByRole('alertdialog');

  it('offers "Eliminar" for active and inactive services, next to Editar and the toggle', () => {
    setup();

    const active = screen.getByTestId('service-row-servicio-basico');
    expect(within(active).getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(within(active).getByRole('button', { name: 'Desactivar' })).toBeInTheDocument();
    expect(within(active).getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
    expect(within(screen.getByTestId('service-row-viejo')).getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
  });

  it('asks for confirmation naming the service, and says what is kept and what is lost', async () => {
    const user = setup();
    await clickDelete(user, 'servicio-basico');

    expect(dialog()).toHaveTextContent('Eliminar servicio');
    expect(dialog()).toHaveTextContent('Servicio Básico');
    expect(dialog()).toHaveTextContent('permanente');
    expect(dialog()).toHaveTextContent('reservas pasadas se conservan');
    expect(dialog()).toHaveTextContent('Desactivar');
    expect(deleteServicePermanently).not.toHaveBeenCalled();
  });

  it('does nothing when the confirmation is cancelled', async () => {
    const user = setup();
    await clickDelete(user, 'servicio-basico');

    await user.click(within(dialog()).getByRole('button', { name: 'Cancelar' }));

    expect(deleteServicePermanently).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('deletes after confirming, toasts and refreshes the list', async () => {
    const user = setup();
    deleteServicePermanently.mockResolvedValue({ id: 'servicio-basico', deleted: true });
    await clickDelete(user, 'servicio-basico');

    await user.click(within(dialog()).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(deleteServicePermanently).toHaveBeenCalledWith('servicio-basico');
    expect(deleteService).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Servicio eliminado');
  });

  it('shows the backend reason when the delete is blocked and does not refresh', async () => {
    const user = setup();
    const reason = 'No se puede eliminar el servicio "Servicio Básico": tiene 2 reservas futuras confirmadas. Cancélalas o desactiva el servicio.';
    deleteServicePermanently.mockRejectedValue(new Error(reason));
    await clickDelete(user, 'servicio-basico');

    await user.click(within(dialog()).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(reason));
    expect(onChanged).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
