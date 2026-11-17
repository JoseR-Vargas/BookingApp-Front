// ===== MARCA DEL NEGOCIO =====
// Business name, brand colors and logo URL (GET /api/branding, SPEC 03). The provider wraps the
// whole app (public site, login, admin, cancel page): it starts from the browser cache (the same
// colors index.html already painted), asks the backend once, applies the colors to <html> and
// refreshes the cache. When the backend fails, the cached or default branding stays.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getBranding } from '../services/brandingService.js';
import { DEFAULT_COLORS, applyBrandColors, readBrandingCache, writeBrandingCache } from '../theme/brandTheme.js';

const noop = () => {};

const DEFAULT_BRANDING = Object.freeze({
  businessName: null,
  colors: DEFAULT_COLORS,
  logoUrl: null,
  status: 'ready',
  refresh: noop,
  setBranding: noop,
});

// Components rendered without the provider (isolated tests) simply get the default branding.
export const BrandingContext = createContext(DEFAULT_BRANDING);

function initialBranding() {
  const cached = readBrandingCache();
  return {
    businessName: cached?.businessName ?? null,
    colors: cached?.colors ?? DEFAULT_COLORS,
    logoUrl: null,
    status: 'loading',
  };
}

export function BrandingProvider({ children }) {
  const [branding, setState] = useState(initialBranding);
  // Only the latest request may write state: older answers (and answers after unmount) are dropped.
  const latestRequest = useRef(0);

  const setBranding = useCallback((data) => {
    latestRequest.current += 1;
    const next = {
      businessName: data.businessName ?? null,
      colors: data.colors ?? DEFAULT_COLORS,
      logoUrl: data.logoUrl ?? null,
    };
    applyBrandColors(next.colors);
    writeBrandingCache(next);
    setState({ ...next, status: 'ready' });
  }, []);

  const refresh = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const data = await getBranding();
      if (request !== latestRequest.current) return;
      setBranding(data);
    } catch {
      if (request !== latestRequest.current) return;
      setState((current) => ({ ...current, status: 'error' }));
    }
  }, [setBranding]);

  useEffect(() => {
    refresh();
    return () => { latestRequest.current += 1; };
  }, [refresh]);

  const value = useMemo(() => ({ ...branding, refresh, setBranding }), [branding, refresh, setBranding]);

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

/**
 * @returns {{businessName: string|null, colors: {accent: string, background: string, text: string, accentSecondary: string|null},
 *   logoUrl: string|null, status: 'loading'|'ready'|'error', refresh: () => Promise<void>, setBranding: (data: object) => void}}
 */
export function useBranding() {
  return useContext(BrandingContext);
}
