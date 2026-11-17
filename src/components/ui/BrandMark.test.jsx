import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { APP_CONFIG } from '../../config/appConfig.js';
import { BrandingContext } from '../../state/brandingState.jsx';
import { DEFAULT_COLORS } from '../../theme/brandTheme.js';
import BrandMark from './BrandMark.jsx';

const renderWith = (branding, props = {}) =>
  render(
    <BrandingContext.Provider value={{ businessName: null, colors: DEFAULT_COLORS, logoUrl: null, ...branding }}>
      <BrandMark textClassName="brand-text" {...props} />
    </BrandingContext.Provider>,
  );

describe('BrandMark', () => {
  it('shows only "BookingApp" when there is no logo', () => {
    renderWith({});
    expect(screen.getByText('BookingApp')).toHaveClass('brand-text');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows the logo before "BookingApp", named after the business', () => {
    renderWith({ logoUrl: '/api/branding/logo?v=7', businessName: 'Barbería Don Pepe' });
    const logo = screen.getByRole('img', { name: 'Barbería Don Pepe' });
    expect(logo).toHaveAttribute('src', `${APP_CONFIG.BACKEND_URL}/api/branding/logo?v=7`);
    expect(logo.compareDocumentPosition(screen.getByText('BookingApp')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('uses "Logo" as alt text without a business name', () => {
    renderWith({ logoUrl: '/api/branding/logo?v=7' });
    expect(screen.getByRole('img', { name: 'Logo' })).toBeInTheDocument();
  });

  it('hides a logo that fails to load', () => {
    renderWith({ logoUrl: '/api/branding/logo?v=7' });
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('BookingApp')).toBeInTheDocument();
  });

  it('can hide the text and keep the logo (collapsed sidebar)', () => {
    renderWith({ logoUrl: '/api/branding/logo?v=7' }, { hideText: true });
    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(screen.getByText('BookingApp')).toHaveClass('hidden');
  });
});
