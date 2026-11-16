import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/cancellationService.js', () => ({
  getCancellation: vi.fn(),
  cancelByToken: vi.fn(),
}));

import { cancelByToken, getCancellation } from '../services/cancellationService.js';
import CancelBooking from './CancelBooking.jsx';

const TOKEN = 'abcDEF123_-abcDEF123_-abcDEF123_-abcDEF1234';

const summary = (state = 'cancellable') => ({
  state,
  services: [{ name: 'Servicio Básico' }, { name: 'Sesión Exprés' }],
  professional: { name: 'Alex García' },
  date: '2030-01-07',
  time: '10:30',
});

const httpError = (status, message) => Object.assign(new Error(message), { status });

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/cancelar/${TOKEN}`]}>
      <Routes>
        <Route path="/cancelar/:token" element={<CancelBooking />} />
        <Route path="/" element={<p>home page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CancelBooking page', () => {
  it('asks the backend for the booking of the token in the URL, showing a loading state', async () => {
    getCancellation.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(getCancellation).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByText('Cargando tu reserva...')).toBeInTheDocument();
  });

  it('shows what is being cancelled and warns about the cutoff when it is cancellable', async () => {
    getCancellation.mockResolvedValue(summary());

    renderPage();

    expect(await screen.findByText('Servicio Básico, Sesión Exprés')).toBeInTheDocument();
    expect(screen.getByText('Alex García')).toBeInTheDocument();
    expect(screen.getByText('10:30')).toBeInTheDocument();
    expect(screen.getByText(/lunes, 7 de enero de 2030/i)).toBeInTheDocument();
    expect(screen.getByText(/hasta 1 minuto antes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar reserva' })).toBeEnabled();
  });

  it('does not cancel until the client confirms in the dialog', async () => {
    const user = userEvent.setup();
    getCancellation.mockResolvedValue(summary());
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/¿Seguro que quieres cancelar/)).toBeInTheDocument();
    expect(cancelByToken).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Volver' }));
    expect(cancelByToken).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancelar reserva' })).toBeInTheDocument();
  });

  it('cancels after confirming and offers to book again', async () => {
    const user = userEvent.setup();
    getCancellation.mockResolvedValue(summary());
    cancelByToken.mockResolvedValue(summary('cancelled'));
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, cancelar' }));

    expect(cancelByToken).toHaveBeenCalledTimes(1);
    expect(cancelByToken).toHaveBeenCalledWith(TOKEN);
    expect(await screen.findByText('Tu reserva fue cancelada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Reservar de nuevo/ })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument();
  });

  it('shows an already cancelled booking as such, without a cancel button', async () => {
    getCancellation.mockResolvedValue(summary('cancelled'));

    renderPage();

    expect(await screen.findByText('Esta reserva ya fue cancelada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Reservar de nuevo/ })).toBeInTheDocument();
  });

  it('explains that it is too late once the cutoff has passed, keeping the details', async () => {
    getCancellation.mockResolvedValue(summary('closed'));

    renderPage();

    expect(await screen.findByText('Ya no se puede cancelar esta reserva')).toBeInTheDocument();
    expect(screen.getByText('Servicio Básico, Sesión Exprés')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument();
  });

  it('switches to the too-late message when the backend refuses with 409 on confirm', async () => {
    const user = userEvent.setup();
    getCancellation.mockResolvedValue(summary());
    cancelByToken.mockRejectedValue(httpError(409, 'Ya no es posible cancelar esta reserva'));
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, cancelar' }));

    expect(await screen.findByText('Ya no se puede cancelar esta reserva')).toBeInTheDocument();
    // The dialog leaves with a transition: it is gone shortly after, not instantly.
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('shows a not-found message for an unknown or malformed token', async () => {
    getCancellation.mockRejectedValue(httpError(404, 'Reserva no encontrada'));

    renderPage();

    expect(await screen.findByText('No encontramos esta reserva')).toBeInTheDocument();
    expect(screen.getByText(/enlace del email/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it.each([
    ['a 503 from the server', httpError(503, 'No se puede verificar el horario del negocio.')],
    ['a network failure', new Error('Failed to fetch')],
  ])('offers to retry after %s while loading', async (_name, error) => {
    const user = userEvent.setup();
    getCancellation.mockRejectedValueOnce(error).mockResolvedValueOnce(summary());
    renderPage();

    expect(await screen.findByText('No pudimos cargar tu reserva')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Servicio Básico, Sesión Exprés')).toBeInTheDocument();
    expect(getCancellation).toHaveBeenCalledTimes(2);
  });

  it('keeps the booking on screen and lets the client retry when confirming fails', async () => {
    const user = userEvent.setup();
    getCancellation.mockResolvedValue(summary());
    cancelByToken
      .mockRejectedValueOnce(httpError(503, 'No se puede verificar el horario del negocio.'))
      .mockResolvedValueOnce(summary('cancelled'));
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, cancelar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cancelar tu reserva');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByText('Servicio Básico, Sesión Exprés')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, cancelar' }));

    expect(await screen.findByText('Tu reserva fue cancelada')).toBeInTheDocument();
  });

  it('never shows client data or the token', async () => {
    getCancellation.mockResolvedValue(summary());

    const { container } = renderPage();
    await screen.findByText('Alex García');

    expect(container.textContent).not.toContain(TOKEN);
  });
});
