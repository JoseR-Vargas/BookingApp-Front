import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BookingsTable from './BookingsTable.jsx';

const booking = (reminders) => ({
  _id: 'b1',
  client: { name: 'Ana', email: 'ana@x.com', phone: '3001234567' },
  date: '2030-03-25',
  time: '10:00',
  status: 'confirmed',
  services: [{ id: 's1', name: 'Corte', price: 100 }],
  reminders,
});

describe('reminders in the bookings table (spec 24)', () => {
  it('shows nothing when the booking has no reminders', () => {
    render(<BookingsTable bookings={[booking(undefined)]} />);
    expect(screen.queryByTestId('booking-reminders-b1')).not.toBeInTheDocument();
  });

  it('shows the sent reminders and the failed ones', () => {
    render(<BookingsTable bookings={[booking([
      { kind: '24h', channel: 'whatsapp', sentAt: '2030-03-24T10:00:00.000Z', ok: true, error: null, attempts: 1 },
      { kind: '3h', channel: 'email', sentAt: '2030-03-25T07:00:00.000Z', ok: false, error: 'smtp down', attempts: 2 },
    ])]} />);
    const badges = screen.getByTestId('booking-reminders-b1');
    expect(badges).toHaveTextContent('Recordatorio enviado');
    expect(badges).toHaveTextContent('Recordatorio fallido');
  });
});
