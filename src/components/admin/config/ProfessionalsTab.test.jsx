import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_CATALOG } from '../../../test/catalogFixture.js';

vi.mock('../../../services/adminService.js', () => ({
  createProfessional: vi.fn(),
  updateProfessional: vi.fn(),
  deleteProfessional: vi.fn(),
  uploadProfessionalPhoto: vi.fn(),
  deleteProfessionalPhoto: vi.fn(),
  deleteProfessionalPermanently: vi.fn(),
}));
vi.mock('../../../utils/resizeImage.js', async (importOriginal) => ({
  ...(await importOriginal()),
  resizeToSquareJpeg: vi.fn(),
}));
vi.mock('../../../ui/toast.js', () => ({
  toast: { show: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import {
  createProfessional,
  deleteProfessional,
  deleteProfessionalPermanently,
  deleteProfessionalPhoto,
  updateProfessional,
  uploadProfessionalPhoto,
} from '../../../services/adminService.js';
import { INVALID_PHOTO_MESSAGE, UNREADABLE_PHOTO_MESSAGE, resizeToSquareJpeg } from '../../../utils/resizeImage.js';
import { toast } from '../../../ui/toast.js';
import ProfessionalsTab from './ProfessionalsTab.jsx';

const professionals = [
  ...ADMIN_CATALOG.professionals,
  { id: 'inactivo', name: 'Pedro Pausa', specialty: 'Ex', experience: '2 años', rating: 5, avatar: 'x', active: false },
];

let onChanged;

function setup(list = professionals) {
  onChanged = vi.fn();
  render(<ProfessionalsTab professionals={list} onChanged={onChanged} />);
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

const PHOTO_URL = '/api/catalog/professionals/alex-garcia/photo?v=5';
const NEW_PHOTO = 'data:image/jpeg;base64,NEWPHOTO';
const withPhoto = [{ ...professionals[0], photoUrl: PHOTO_URL }, ...professionals.slice(1)];
const pick = (file) => fireEvent.change(screen.getByTestId('professional-photo-input'), { target: { files: [file] } });
const imageFile = (type = 'image/png') => new File([new Uint8Array(2048)], 'foto', { type });
const rowImage = (id) => screen.getByTestId(`professional-row-${id}`).querySelector('img');

describe('ProfessionalsTab list photos', () => {
  it('shows the photo, or the initials without one, next to each name', () => {
    setup(withPhoto);

    expect(rowImage('alex-garcia')).toHaveAttribute('src', expect.stringContaining(PHOTO_URL));
    expect(rowImage('alex-garcia')).toHaveClass('rounded-full');
    const withoutPhoto = screen.getByTestId('professional-row-maria-lopez');
    expect(withoutPhoto.querySelector('img')).toBeNull();
    expect(within(withoutPhoto).getByText('ML')).toBeInTheDocument();
  });
});

describe('ProfessionalsTab photo on create', () => {
  it('offers an optional profile photo field with a round preview', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: /Nuevo profesional/ }));

    expect(screen.getByLabelText(/Foto de perfil/)).toBe(screen.getByTestId('professional-photo-input'));
    expect(screen.getByTestId('professional-photo-input')).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp');
    expect(screen.queryByRole('button', { name: 'Quitar foto' })).not.toBeInTheDocument();
  });

  it('resizes the picked photo, previews it round and creates the professional with it', async () => {
    const user = setup();
    resizeToSquareJpeg.mockResolvedValue(NEW_PHOTO);
    createProfessional.mockResolvedValue({ id: 'ana' });
    await user.click(screen.getByRole('button', { name: /Nuevo profesional/ }));
    await user.type(screen.getByTestId('professional-name-input'), 'Ana Prueba');

    const file = imageFile();
    pick(file);

    const preview = await screen.findByTestId('professional-photo-preview');
    await waitFor(() => expect(preview.querySelector('img')).toHaveAttribute('src', NEW_PHOTO));
    expect(preview.querySelector('img')).toHaveClass('rounded-full');
    expect(resizeToSquareJpeg).toHaveBeenCalledWith(file);

    await user.click(screen.getByTestId('professional-save'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(createProfessional).toHaveBeenCalledWith({
      name: 'Ana Prueba',
      specialty: '',
      experience: '',
      photoDataUrl: NEW_PHOTO,
    });
    expect(uploadProfessionalPhoto).not.toHaveBeenCalled();
  });

  it('"Quitar foto" drops the picked photo before saving', async () => {
    const user = setup();
    resizeToSquareJpeg.mockResolvedValue(NEW_PHOTO);
    createProfessional.mockResolvedValue({ id: 'ana' });
    await user.click(screen.getByRole('button', { name: /Nuevo profesional/ }));
    await user.type(screen.getByTestId('professional-name-input'), 'Ana Prueba');
    pick(imageFile());
    await user.click(await screen.findByRole('button', { name: 'Quitar foto' }));

    expect(screen.getByTestId('professional-photo-preview').querySelector('img')).toBeNull();
    await user.click(screen.getByTestId('professional-save'));
    await waitFor(() => expect(createProfessional).toHaveBeenCalled());
    expect(createProfessional.mock.calls[0][0]).not.toHaveProperty('photoDataUrl');
  });

  it('shows the file error under the field and never resizes or uploads an invalid file', async () => {
    const user = setup();
    resizeToSquareJpeg.mockRejectedValue(new Error(INVALID_PHOTO_MESSAGE));
    await user.click(screen.getByRole('button', { name: /Nuevo profesional/ }));

    pick(imageFile('image/svg+xml'));

    expect(await screen.findByTestId('professional-photo-error')).toHaveTextContent(INVALID_PHOTO_MESSAGE);
    expect(createProfessional).not.toHaveBeenCalled();
    expect(screen.getByTestId('professional-photo-preview').querySelector('img')).toBeNull();
  });

  it('shows the "cannot read" message for an image the browser cannot decode', async () => {
    const user = setup();
    resizeToSquareJpeg.mockRejectedValue(new Error(UNREADABLE_PHOTO_MESSAGE));
    await user.click(screen.getByRole('button', { name: /Nuevo profesional/ }));

    pick(imageFile('image/jpeg'));

    expect(await screen.findByTestId('professional-photo-error')).toHaveTextContent(UNREADABLE_PHOTO_MESSAGE);
  });
});

describe('ProfessionalsTab photo on edit', () => {
  const openEdit = async (user) => user.click(screen.getByTestId('professional-edit-alex-garcia'));

  it('shows the current photo and keeps it untouched when nothing is changed', async () => {
    const user = setup(withPhoto);
    updateProfessional.mockResolvedValue({});
    await openEdit(user);

    expect(screen.getByTestId('professional-photo-preview').querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining(PHOTO_URL),
    );
    await user.click(screen.getByTestId('professional-save'));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(uploadProfessionalPhoto).not.toHaveBeenCalled();
    expect(deleteProfessionalPhoto).not.toHaveBeenCalled();
  });

  it('uploads a new photo after the data update, only on save', async () => {
    const user = setup(withPhoto);
    resizeToSquareJpeg.mockResolvedValue(NEW_PHOTO);
    updateProfessional.mockResolvedValue({});
    uploadProfessionalPhoto.mockResolvedValue({});
    await openEdit(user);

    pick(imageFile());
    await waitFor(() => expect(resizeToSquareJpeg).toHaveBeenCalled());
    expect(uploadProfessionalPhoto).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('professional-save'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(updateProfessional).toHaveBeenCalledWith('alex-garcia', expect.not.objectContaining({ photoDataUrl: expect.anything() }));
    expect(uploadProfessionalPhoto).toHaveBeenCalledWith('alex-garcia', NEW_PHOTO);
  });

  it('removes the current photo on save with "Quitar foto"', async () => {
    const user = setup(withPhoto);
    updateProfessional.mockResolvedValue({});
    deleteProfessionalPhoto.mockResolvedValue({});
    await openEdit(user);

    await user.click(screen.getByRole('button', { name: 'Quitar foto' }));
    expect(screen.getByTestId('professional-photo-preview').querySelector('img')).toBeNull();
    expect(deleteProfessionalPhoto).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('professional-save'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(deleteProfessionalPhoto).toHaveBeenCalledWith('alex-garcia');
  });

  it('does not call the delete endpoint for a professional that never had a photo', async () => {
    const user = setup();
    updateProfessional.mockResolvedValue({});
    await openEdit(user);

    expect(screen.queryByRole('button', { name: 'Quitar foto' })).not.toBeInTheDocument();
    await user.click(screen.getByTestId('professional-save'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(deleteProfessionalPhoto).not.toHaveBeenCalled();
  });

  it('reports a failed photo after the data was saved, and still refreshes the list', async () => {
    const user = setup(withPhoto);
    resizeToSquareJpeg.mockResolvedValue(NEW_PHOTO);
    updateProfessional.mockResolvedValue({});
    uploadProfessionalPhoto.mockRejectedValue(new Error('La foto debe ser PNG, JPG o WebP de hasta 200 KB.'));
    await openEdit(user);
    pick(imageFile());
    await waitFor(() => expect(resizeToSquareJpeg).toHaveBeenCalled());

    await user.click(screen.getByTestId('professional-save'));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('La foto debe ser PNG, JPG o WebP de hasta 200 KB.'));
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('datos'));
  });
});


describe('ProfessionalsTab permanent delete', () => {
  const clickDelete = (user, id) => user.click(screen.getByTestId(`professional-delete-${id}`));
  const dialog = () => screen.getByRole('alertdialog');

  it('offers "Eliminar" for active and inactive professionals, next to Editar and Desactivar', () => {
    setup();

    const active = screen.getByTestId('professional-row-alex-garcia');
    expect(within(active).getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(within(active).getByRole('button', { name: 'Desactivar' })).toBeInTheDocument();
    expect(within(active).getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
    expect(within(screen.getByTestId('professional-row-inactivo')).getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
  });

  it('asks for confirmation naming the professional, and says what is kept and what is lost', async () => {
    const user = setup();
    await clickDelete(user, 'alex-garcia');

    expect(dialog()).toHaveTextContent('Eliminar profesional');
    expect(dialog()).toHaveTextContent('Alex García');
    expect(dialog()).toHaveTextContent('permanente');
    expect(dialog()).toHaveTextContent('reservas pasadas se conservan');
    expect(dialog()).toHaveTextContent('Desactivar');
    expect(deleteProfessionalPermanently).not.toHaveBeenCalled();
  });

  it('does nothing when the confirmation is cancelled', async () => {
    const user = setup();
    await clickDelete(user, 'alex-garcia');

    await user.click(within(dialog()).getByRole('button', { name: 'Cancelar' }));

    expect(deleteProfessionalPermanently).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('deletes after confirming, toasts and refreshes the list', async () => {
    const user = setup();
    deleteProfessionalPermanently.mockResolvedValue({ id: 'alex-garcia', deleted: true });
    await clickDelete(user, 'alex-garcia');

    await user.click(within(dialog()).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(deleteProfessionalPermanently).toHaveBeenCalledWith('alex-garcia');
    expect(deleteProfessional).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Profesional eliminado');
  });

  it('shows the backend reason when the delete is blocked and does not refresh', async () => {
    const user = setup();
    const reason = 'No se puede eliminar a Alex García: tiene 2 reservas futuras confirmadas. Cancélalas o desactiva al profesional.';
    deleteProfessionalPermanently.mockRejectedValue(new Error(reason));
    await clickDelete(user, 'alex-garcia');

    await user.click(within(dialog()).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(reason));
    expect(onChanged).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('"Desactivar" still deactivates and never deletes permanently', async () => {
    const user = setup();
    deleteProfessional.mockResolvedValue({});
    await user.click(screen.getByTestId('professional-toggle-alex-garcia'));
    await user.click(within(dialog()).getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => expect(deleteProfessional).toHaveBeenCalledWith('alex-garcia'));
    expect(deleteProfessionalPermanently).not.toHaveBeenCalled();
  });
});
