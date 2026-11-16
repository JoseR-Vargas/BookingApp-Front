import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandingContext } from '../../state/brandingState.jsx';
import { DEFAULT_COLORS } from '../../theme/brandTheme.js';
import Hero from './Hero.jsx';

const renderHero = (businessName) =>
  render(
    <BrandingContext.Provider value={{ businessName, colors: DEFAULT_COLORS, logoUrl: null }}>
      <Hero onReserve={() => {}} />
    </BrandingContext.Provider>,
  );

describe('Hero title', () => {
  it('shows the business name when the admin set one', () => {
    renderHero('Barbería Don Pepe');
    const title = screen.getByRole('heading', { level: 1 });
    expect(title).toHaveTextContent(/^Barbería Don Pepe$/);
    expect(title).not.toHaveTextContent(/prioridad/i);
  });

  it('keeps "Tu tiempo, nuestra prioridad" without a business name', () => {
    renderHero(null);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Tu tiempo,\s*nuestra\s*prioridad/);
  });
});
