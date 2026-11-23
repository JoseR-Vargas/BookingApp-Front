import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ConfirmationModal from './ConfirmationModal.jsx';

const details = (overrides = {}) => ({
  serviceNames: ['Servicio Básico'],
  professionalName: 'Alex García',
  date: '2030-03-04',
  time: '11:00',
  price: 1200,
  email: 'juan@example.com',
  ...overrides,
});

const renderModal = (props = {}) => render(
  <ConfirmationModal open onClose={vi.fn()} details={details()} {...props} />,
);

describe('ConfirmationModal', () => {
  it('shows the booking and where the confirmation was sent', async () => {
    renderModal();

    const dialog = await screen.findByRole('dialog', { name: '¡Reserva Confirmada!' });
    expect(within(dialog).getByText('Servicio Básico')).toBeInTheDocument();
    expect(within(dialog).getByText('Alex García')).toBeInTheDocument();
    expect(within(dialog).getByText(/Te enviamos la confirmación a/)).toHaveTextContent('Te enviamos la confirmación a juan@example.com');
    expect(within(dialog).getByRole('button', { name: 'Entendido' })).toBeInTheDocument();
  });

  it('shows no cancel link or copy button, even if the details still carry a token (it travels by email)', async () => {
    renderModal({ details: details({ cancelToken: 'abcDEF123_-abcDEF123_-abcDEF123_-abcDEF1234' }) });

    const dialog = await screen.findByRole('dialog', { name: '¡Reserva Confirmada!' });
    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Copiar enlace' })).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/cancelar/i)).not.toBeInTheDocument();
  });

  it('closes with "Entendido"', async () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    (await screen.findByRole('button', { name: 'Entendido' })).click();

    expect(onClose).toHaveBeenCalled();
  });
});
