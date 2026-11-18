import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ConfirmationModal from './ConfirmationModal.jsx';

const TOKEN = 'abcDEF123_-abcDEF123_-abcDEF123_-abcDEF1234';

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

const CANCEL_NOTICE = 'Para cancelar la reserva puedes hacerlo desde el email.';

describe('ConfirmationModal cancellation notice', () => {
  it('tells the client the booking is cancelled from the email', async () => {
    renderModal();

    const dialog = await screen.findByRole('dialog', { name: '¡Reserva Confirmada!' });
    expect(within(dialog).getByText(CANCEL_NOTICE)).toBeInTheDocument();
  });

  it('shows the notice whether or not the backend sent a token', async () => {
    renderModal({ details: details({ cancelToken: undefined }) });

    const dialog = await screen.findByRole('dialog', { name: '¡Reserva Confirmada!' });
    expect(within(dialog).getByText(CANCEL_NOTICE)).toBeInTheDocument();
  });

  it('never shows the cancel link or a way to copy it, even when a token is passed', async () => {
    renderModal();

    const dialog = await screen.findByRole('dialog', { name: '¡Reserva Confirmada!' });
    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument();
    expect(dialog.textContent).not.toContain('/cancelar/');
    expect(dialog.textContent).not.toContain(TOKEN);
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
