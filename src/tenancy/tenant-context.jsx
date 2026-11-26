// ===== CONTEXTO DEL NEGOCIO =====
// `useTenant()` tells a component which business the page belongs to, and `useTenantPath()` builds
// the in-app links of that business. The slug comes from the route (`/n/<slug>/...`).

import { createContext, useContext, useMemo } from 'react';
import { parseTenantPath } from './tenant-resolver.js';
import { tenantPath } from './tenant-link.js';

const TenantContext = createContext({ slug: null, isDefault: true });

export function TenantProvider({ slug = null, children }) {
  const value = useMemo(() => ({ slug, isDefault: !slug }), [slug]);
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

/** The business of the page: `{ slug: string|null, isDefault: boolean }`. */
export function useTenant() {
  return useContext(TenantContext);
}

/** Returns a function that turns a plain path into the path of the current business. */
export function useTenantPath() {
  const { slug } = useTenant();
  return (path) => tenantPath(slug, path);
}

export { parseTenantPath };
