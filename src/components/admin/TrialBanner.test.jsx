import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TrialBanner from './TrialBanner.jsx';

describe('TrialBanner', () => {
  it('renders nothing for a business without a trial', () => {
    const { container } = render(<TrialBanner trial={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the days left and the bookings made', () => {
    render(<TrialBanner trial={{ daysLeft: 9, bookingsMade: 4, bookingQuota: 20, blocked: false }} />);
    expect(screen.getByRole('status')).toHaveTextContent('te quedan 9 días y 4 de 20 reservas');
  });

  it('uses the singular for the last day', () => {
    render(<TrialBanner trial={{ daysLeft: 1, bookingsMade: 0, bookingQuota: 20, blocked: false }} />);
    expect(screen.getByRole('status')).toHaveTextContent('te quedan 1 día y');
  });

  it('says that the business no longer takes bookings when it is blocked', () => {
    render(<TrialBanner trial={{ daysLeft: 0, bookingsMade: 20, bookingQuota: 20, blocked: true }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Tu prueba gratuita terminó.');
    expect(screen.getByRole('alert')).toHaveTextContent('no acepta reservas nuevas');
  });
});
