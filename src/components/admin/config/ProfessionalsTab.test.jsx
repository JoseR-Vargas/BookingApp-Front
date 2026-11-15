import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_CATALOG } from '../../../test/catalogFixture.js';

vi.mock('../../../services/adminService.js', () => ({
  createProfessional: vi.fn(),
  updateProfessional: vi.fn(),
  deleteProfessional: vi.fn(),
}));
vi.mock('../../../ui/toast.js', () => ({
  toast: { show: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { createProfessional, deleteProfessional, updateProfessional } from '../../../services/adminService.js';
import { toast } from '../../../ui/toast.js';
import ProfessionalsTab from './ProfessionalsTab.jsx';

const professionals = [
  ...ADMIN_CATALOG.professionals,
  { id: 'inactivo', name: 'Pedro Pausa', specialty: 'Ex', experience: '2 años', rating: 5, avatar: 'x', active: false },
];

let onChanged;

function setup() {
  onChanged = vi.fn();
  render(<ProfessionalsTab professionals={professionals} onChanged={onChanged} />);
  return userEvent.setup();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProfessionalsTab list', () => {
  it('lists name, specialty, experience and an active badge per professional', () => {
    setup();

    const row = screen.getByTestId('professional-row-alex-garcia');
    expect(within(row).getByText('Alex García')).toBeInTheDocument();
    expect(within(row).getByText('Especialista')).toBeInTheDocument();
    expect(within(row).getByText('8 años')).toBeInTheDocument();
    expect(within(row).getByText('Activo')).toBeInTheDocument();
    expect(within(screen.getByTestId('professional-row-inactivo')).getByText('Inactivo')).toBeInTheDocument();
  });
});

describe('ProfessionalsTab create', () => {
  it('has labels bound to the inputs', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: /Nuevo profesional/ }));

    expect(screen.getByLabelText('Nombre')).toBe(screen.getByTestId('professional-name-input'));
    expect(screen.getByLabelText('Especialidad')).toBeInTheDocument();
    expect(screen.getByLabelText('Experiencia')).toBeInTheDocument();
  });

  it('posts the trimmed fields, toasts success and asks the parent to refresh', async () => {
    const user = setup();
    createProfessional.mockResolvedValue({ id: 'ana', active: true });
    await user.click(screen.getByRole('button', { name: /Nuevo profesional/ }));

    await user.type(screen.getByTestId('professional-name-input'), '  Ana Prueba  ');
    await user.type(screen.getByLabelText('Especialidad'), 'Peluquería');
    await user.type(screen.getByLabelText('Experiencia'), '3 años');
    await user.click(screen.getByTestId('professional-save'));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(createProfessional).toHaveBeenCalledWith({ name: 'Ana Prueba', specialty: 'Peluquería', experience: '3 años' });
    expect(toast.success).toHaveBeenCalled();
    expect(screen.queryByTestId('professional-name-input')).not.toBeInTheDocument();
  });

  it('requires a name without calling the backend', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: /Nuevo profesional/ }));

    await user.click(screen.getByTestId('professional-save'));

    expect(screen.getByRole('alert')).toHaveTextContent('El nombre es obligatorio');
    expect(createProfessional).not.toHaveBeenCalled();
  });

  it('disables the save button with a spinner label while saving, then shows the backend error', async () => {
    const user = setup();
    let rejectCreate;
    createProfessional.mockImplementation(() => new Promise((_, reject) => { rejectCreate = reject; }));
    await user.click(screen.getByRole('button', { name: /Nuevo profesional/ }));
    await user.type(screen.getByTestId('professional-name-input'), 'Ana');
    await user.click(screen.getByTestId('professional-save'));

    expect(screen.getByTestId('professional-save')).toBeDisabled();
    expect(screen.getByTestId('professional-save')).toHaveTextContent('Guardando...');

    rejectCreate(new Error('name must be between 1 and 80 characters'));

    expect(await screen.findByRole('alert')).toHaveTextContent('name must be between 1 and 80 characters');
    expect(screen.getByTestId('professional-save')).toBeEnabled();
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe('ProfessionalsTab edit and activation', () => {
  it('edits a professional with a partial update of the changed fields', async () => {
    const user = setup();
    updateProfessional.mockResolvedValue({});
    await user.click(screen.getByTestId('professional-edit-alex-garcia'));

    const name = screen.getByTestId('professional-name-input');
    expect(name).toHaveValue('Alex García');
    await user.clear(name);
    await user.type(name, 'Alex G.');
    await user.click(screen.getByTestId('professional-save'));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(updateProfessional).toHaveBeenCalledWith('alex-garcia', {
      name: 'Alex G.',
      specialty: 'Especialista',
      experience: '8 años',
    });
  });

  it('asks for confirmation before deactivating, and does nothing if cancelled', async () => {
    const user = setup();

    await user.click(screen.getByTestId('professional-toggle-alex-garcia'));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Alex García');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(deleteProfessional).not.toHaveBeenCalled();
    expect(updateProfessional).not.toHaveBeenCalled();
  });

  it('deactivates after confirming', async () => {
    const user = setup();
    deleteProfessional.mockResolvedValue({ id: 'alex-garcia', active: false });

    await user.click(screen.getByTestId('professional-toggle-alex-garcia'));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(deleteProfessional).toHaveBeenCalledWith('alex-garcia');
    expect(toast.success).toHaveBeenCalled();
  });

  it('reactivates an inactive professional without confirmation', async () => {
    const user = setup();
    updateProfessional.mockResolvedValue({});

    await user.click(screen.getByTestId('professional-toggle-inactivo'));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(updateProfessional).toHaveBeenCalledWith('inactivo', { active: true });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('toasts the backend error when the change fails', async () => {
    const user = setup();
    updateProfessional.mockRejectedValue(new Error('Professional not found'));

    await user.click(screen.getByTestId('professional-toggle-inactivo'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Professional not found'));
    expect(onChanged).not.toHaveBeenCalled();
  });
});
