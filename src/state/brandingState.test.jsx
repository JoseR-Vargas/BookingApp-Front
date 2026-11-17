import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBranding } from '../services/brandingService.js';
import { BRANDING_CACHE_KEY, DEFAULT_COLORS } from '../theme/brandTheme.js';
import { BrandingProvider, useBranding } from './brandingState.jsx';

vi.mock('../services/brandingService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getBranding: vi.fn(),
}));

const SAVED = {
  businessName: 'Barbería Don Pepe',
  colors: { accent: '#336699', background: '#ffffff', text: '#111111', button: null },
  logoUrl: '/api/branding/logo?v=1',
};

let latest;
function Probe() {
  latest = useBranding();
  return <p>{latest.businessName ?? 'sin nombre'}</p>;
}

const rootStyle = () => document.documentElement.style;

beforeEach(() => {
  localStorage.clear();
  getBranding.mockReset();
});

afterEach(() => {
  document.documentElement.removeAttribute('style');
});

describe('BrandingProvider', () => {
  it('loads the branding, applies its colors and caches them', async () => {
    getBranding.mockResolvedValue(SAVED);
    render(<BrandingProvider><Probe /></BrandingProvider>);

    expect(await screen.findByText('Barbería Don Pepe')).toBeInTheDocument();
    expect(rootStyle().getPropertyValue('--brand-accent')).toBe('#336699');
    expect(rootStyle().getPropertyValue('--brand-bg')).toBe('#ffffff');
    expect(latest.logoUrl).toBe(SAVED.logoUrl);
    expect(JSON.parse(localStorage.getItem(BRANDING_CACHE_KEY))).toEqual({
      colors: SAVED.colors,
      businessName: 'Barbería Don Pepe',
    });
  });

  it('starts from the cached branding before the backend answers', () => {
    localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify({ colors: SAVED.colors, businessName: 'Desde caché' }));
    getBranding.mockReturnValue(new Promise(() => {}));
    render(<BrandingProvider><Probe /></BrandingProvider>);

    expect(screen.getByText('Desde caché')).toBeInTheDocument();
    expect(latest.colors).toEqual(SAVED.colors);
  });

  it('keeps the cached or default branding when the backend fails', async () => {
    getBranding.mockRejectedValue(new Error('down'));
    render(<BrandingProvider><Probe /></BrandingProvider>);

    await waitFor(() => expect(latest.status).toBe('error'));
    expect(screen.getByText('sin nombre')).toBeInTheDocument();
    expect(latest.colors).toEqual(DEFAULT_COLORS);
    expect(localStorage.getItem(BRANDING_CACHE_KEY)).toBeNull();
  });

  it('setBranding applies a freshly saved branding without refetching', async () => {
    getBranding.mockResolvedValue({ businessName: null, colors: DEFAULT_COLORS, logoUrl: null });
    render(<BrandingProvider><Probe /></BrandingProvider>);
    await waitFor(() => expect(latest.status).toBe('ready'));

    act(() => latest.setBranding(SAVED));

    expect(screen.getByText('Barbería Don Pepe')).toBeInTheDocument();
    expect(rootStyle().getPropertyValue('--brand-text')).toBe('#111111');
    expect(getBranding).toHaveBeenCalledTimes(1);
  });

  it('useBranding outside the provider returns the defaults', () => {
    render(<Probe />);
    expect(latest.colors).toEqual(DEFAULT_COLORS);
    expect(latest.businessName).toBeNull();
    expect(latest.logoUrl).toBeNull();
  });
});
