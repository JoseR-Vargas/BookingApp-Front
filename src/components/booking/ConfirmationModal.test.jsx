import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../ui/toast.js', () => ({
  toast: { show: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { toast } from '../../ui/toast.js';
import ConfirmationModal from './ConfirmationModal.jsx';

const TOKEN = 'abcDEF123_-abcDEF123_-abcDEF123_-abcDEF1234';
const CANCEL_URL = `${window.location.origin}/cancelar/${TOKEN}`;

const details = (overrides = {}) => ({
  serviceNames: ['Servicio Básico'],
  professionalName: 'Alex García',
  date: '2030-03-04',
  time: '11:00',
  price: 1200,
  email: 'juan@example.com',
  cancelToken: TOKEN,
  ...overrides,
});

const renderModal = (props = {}) => render(
  <ConfirmationModal open onClose={vi.fn()} details={details()} {...props} />,
);

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('ConfirmationModal cancel link', () => {
  it('shows the cancel link built from the app origin and the token', async () => {
    renderModal();

    const dialog = await screen.findByRole('dialog', { name: '¡Reserva Confirmada!' });
    const link = within(dialog).getByRole('link', { name: CANCEL_URL });
    expect(link).toHaveAttribute('href', CANCEL_URL);
    expect(within(dialog).getByText(/¿Necesitas cancelar\?/)).toBeInTheDocument();
  });

  it('copies the link to the clipboard and says so', async () => {
    const user = userEvent.setup();
    renderModal();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    await user.click(await screen.findByRole('button', { name: 'Copiar enlace' }));

    expect(writeText).toHaveBeenCalledWith(CANCEL_URL);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Enlace copiado'));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('asks to copy it by hand when the clipboard refuses', async () => {
    const user = userEvent.setup();
    renderModal();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));

    await user.click(await screen.findByRole('button', { name: 'Copiar enlace' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'No se pudo copiar el enlace. Cópialo manualmente.',
    ));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('does not break when the browser has no clipboard API', async () => {
    const user = userEvent.setup();
    renderModal();
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });

    await user.click(await screen.findByRole('button', { name: 'Copiar enlace' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
  });

  it('shows no cancel block when the backend sent no token', async () => {
    renderModal({ details: details({ cancelToken: undefined }) });

    const dialog = await screen.findByRole('dialog', { name: '¡Reserva Confirmada!' });
    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Copiar enlace' })).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/¿Necesitas cancelar\?/)).not.toBeInTheDocument();
  });

  it('keeps the rest of the confirmation as it was', async () => {
    renderModal();

    const dialog = await screen.findByRole('dialog', { name: '¡Reserva Confirmada!' });
    expect(within(dialog).getByText('Servicio Básico')).toBeInTheDocument();
    expect(within(dialog).getByText('juan@example.com')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Entendido' })).toBeInTheDocument();
  });
});
