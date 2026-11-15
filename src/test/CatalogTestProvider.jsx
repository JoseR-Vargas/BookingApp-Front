import { useMemo } from 'react';
import { CatalogContext } from '../state/catalogState.jsx';
import { CATALOG } from './catalogFixture.js';

/**
 * Test double of <CatalogProvider>: serves a fixed catalog without touching the network.
 * `value` overrides any field (e.g. `{ status: 'error' }`), `reload` defaults to a no-op.
 */
export function CatalogTestProvider({ value, children }) {
  const context = useMemo(
    () => ({ ...CATALOG, status: 'ready', reload: () => {}, ...value }),
    [value],
  );
  return <CatalogContext.Provider value={context}>{children}</CatalogContext.Provider>;
}
