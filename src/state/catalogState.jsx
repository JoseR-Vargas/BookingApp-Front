// ===== CATÁLOGO PÚBLICO =====
// Professionals, services and weekly schedule come from the backend (GET /api/catalog), which is
// the single source of truth. The provider loads once on mount; `reload` retries after a failure.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getCatalog } from '../services/catalogService.js';
import { setFallbackSchedule } from '../utils/schedule.js';

const EMPTY = { professionals: [], services: [], schedule: null };

export const CatalogContext = createContext(null);

export function CatalogProvider({ children }) {
  const [catalog, setCatalog] = useState({ ...EMPTY, status: 'loading' });
  // Only the latest request may write state: older answers (and answers after unmount) are dropped.
  const latestRequest = useRef(0);

  const reload = useCallback(async () => {
    const request = ++latestRequest.current;
    setCatalog((current) => ({ ...current, status: 'loading' }));
    try {
      const data = await getCatalog();
      if (request !== latestRequest.current) return;
      // The failure-only availability fallback (utils/schedule.js) follows the catalog hours.
      setFallbackSchedule(data.schedule);
      setCatalog({
        professionals: data.professionals || [],
        services: data.services || [],
        schedule: data.schedule || null,
        status: 'ready',
      });
    } catch {
      if (request !== latestRequest.current) return;
      setCatalog({ ...EMPTY, status: 'error' });
    }
  }, []);

  useEffect(() => {
    reload();
    return () => { latestRequest.current += 1; };
  }, [reload]);

  const value = useMemo(() => ({ ...catalog, reload }), [catalog, reload]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

/** @returns {{professionals: object[], services: object[], schedule: object|null, status: 'loading'|'ready'|'error', reload: () => void}} */
export function useCatalog() {
  const context = useContext(CatalogContext);
  if (!context) {
    throw new Error('useCatalog must be used inside <CatalogProvider>');
  }
  return context;
}
