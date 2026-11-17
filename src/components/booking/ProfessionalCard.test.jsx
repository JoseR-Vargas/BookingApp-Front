import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { APP_CONFIG } from '../../config/appConfig.js';
import ProfessionalCard from './ProfessionalCard.jsx';

const PHOTO = '/api/catalog/professionals/alex-garcia/photo?v=5';
const professional = {
  id: 'alex-garcia',
  name: 'Alex García',
  specialty: 'Especialista',
  experience: '8 años',
  rating: 4.9,
  photoUrl: PHOTO,
};

describe('ProfessionalCard photo', () => {
  it('shows the round photo next to the name', () => {
    render(<ProfessionalCard professional={professional} selected={false} onSelect={() => {}} />);

    const card = screen.getByTestId('professional-card-alex-garcia');
    const image = card.querySelector('img');
    expect(image).toHaveAttribute('src', `${APP_CONFIG.BACKEND_URL}${PHOTO}`);
    expect(image).toHaveClass('rounded-full', 'object-cover');
    expect(card).toHaveTextContent('Alex García');
  });

  it('shows the initials on a round circle without a photo', () => {
    render(<ProfessionalCard professional={{ ...professional, photoUrl: null }} selected={false} onSelect={() => {}} />);

    const card = screen.getByTestId('professional-card-alex-garcia');
    expect(card.querySelector('img')).toBeNull();
    expect(screen.getByText('AG')).toHaveClass('rounded-full');
  });

  it('shows the initials for a professional from an older catalog with no photoUrl field', () => {
    const { photoUrl, ...legacy } = professional;
    render(<ProfessionalCard professional={legacy} selected={false} onSelect={() => {}} />);

    expect(screen.getByText('AG')).toBeInTheDocument();
  });

  it('keeps the card name accessible without repeating it from the decorative avatar', () => {
    render(<ProfessionalCard professional={professional} selected={false} onSelect={() => {}} />);

    expect(screen.getByRole('button', { name: /Alex García/ })).toBeInTheDocument();
  });

  it('still selects the professional when clicked', async () => {
    const onSelect = vi.fn();
    render(<ProfessionalCard professional={professional} selected={false} onSelect={onSelect} />);

    await userEvent.click(screen.getByTestId('professional-card-alex-garcia'));

    expect(onSelect).toHaveBeenCalledWith({ id: 'alex-garcia', name: 'Alex García' });
  });
});
