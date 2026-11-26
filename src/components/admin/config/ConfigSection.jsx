// "Configuración del Negocio": professionals, services, opening hours and the brand (SPEC 03). The data comes from the admin
// catalog (GET /api/admin/catalog, inactive items included), not from the public CatalogProvider.
// After any mutation the tabs call `refresh`, which re-reads the admin catalog.

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAdminCatalog } from '../../../services/adminService.js';
import { catalogLocations } from '../../../utils/locations.js';
import { toast } from '../../../ui/toast.js';
import Button from '../../ui/Button.jsx';
import Spinner from '../../ui/Spinner.jsx';
import SectionHeader from '../SectionHeader.jsx';
import BrandingTab from './BrandingTab.jsx';
import LocationsTab from './LocationsTab.jsx';
import ProfessionalsTab from './ProfessionalsTab.jsx';
import ScheduleTab from './ScheduleTab.jsx';
import ServicesTab from './ServicesTab.jsx';
import ShareTab from './ShareTab.jsx';
import UsersTab from './UsersTab.jsx';

const TABS = [
  { key: 'professionals', label: 'Profesionales' },
  { key: 'services', label: 'Servicios' },
  { key: 'locations', label: 'Locales' },
  { key: 'schedule', label: 'Horarios' },
  { key: 'branding', label: 'Marca' },
  { key: 'users', label: 'Usuarios' },
  { key: 'share', label: 'Compartir' },
];

const TAB_CLASSES = 'cursor-pointer border-b-2 px-4 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent touch:min-h-11';
const TAB_ACTIVE = 'border-accent text-accent';
const TAB_IDLE = 'border-transparent text-text-secondary hover:text-text-primary';

export default function ConfigSection() {
  const [tab, setTab] = useState('professionals');
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState('');
  const tabRefs = useRef({});

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setError('');
    try {
      setCatalog(await getAdminCatalog());
    } catch (err) {
      // A refresh after a mutation keeps the stale list and only reports the failure.
      if (silent) toast.error(err.message);
      else setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = useCallback(() => load({ silent: true }), [load]);

  // Arrow keys move between tabs (WAI-ARIA tabs pattern, automatic activation).
  const handleKeyDown = (event, index) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = TABS[(index + step + TABS.length) % TABS.length];
    setTab(next.key);
    tabRefs.current[next.key]?.focus();
  };

  let body;
  if (tab === 'users') {
    // The accounts live apart from the admin catalog, like the brand.
    body = (
      <div role="tabpanel" id="config-panel-users" aria-labelledby="config-tab-users" tabIndex={0}>
        <UsersTab />
      </div>
    );
  } else if (tab === 'branding') {
    // The brand lives apart from the admin catalog: it never waits for (or fails with) it.
    body = (
      <div role="tabpanel" id="config-panel-branding" aria-labelledby="config-tab-branding" tabIndex={0}>
        <BrandingTab />
      </div>
    );
  } else if (error) {
    body = (
      <div role="alert" className="flex flex-col items-center gap-4 py-12 text-center text-text-secondary">
        <p>{error}</p>
        <Button size="sm" onClick={() => load()}>Reintentar</Button>
      </div>
    );
  } else if (!catalog) {
    body = (
      <div className="flex items-center justify-center gap-3 py-12 text-text-secondary">
        <Spinner />
        <span>Cargando configuración...</span>
      </div>
    );
  } else {
    body = (
      <div role="tabpanel" id={`config-panel-${tab}`} aria-labelledby={`config-tab-${tab}`} tabIndex={0}>
        {tab === 'professionals' && (
          <ProfessionalsTab professionals={catalog.professionals} locations={catalog.locations} onChanged={refresh} />
        )}
        {tab === 'services' && (
          <ServicesTab services={catalog.services} professionals={catalog.professionals} onChanged={refresh} />
        )}
        {tab === 'share' && <ShareTab publicAvailability={catalog.publicAvailability} services={catalog.services} onChanged={refresh} />}
        {tab === 'locations' && <LocationsTab locations={catalogLocations(catalog)} onChanged={refresh} />}
        {tab === 'schedule' && <ScheduleTab schedule={catalog.schedule} locations={catalog.locations} services={catalog.services} onChanged={refresh} />}
      </div>
    );
  }

  return (
    <section aria-label="Configuración">
      <SectionHeader title="Configuración del Negocio" />

      <div role="tablist" aria-label="Configuración del negocio" className="mb-6 flex flex-wrap border-b border-border-subtle">
        {TABS.map(({ key, label }, index) => {
          const selected = key === tab;
          return (
            <button
              key={key}
              ref={(node) => { tabRefs.current[key] = node; }}
              type="button"
              role="tab"
              id={`config-tab-${key}`}
              data-testid={`config-tab-${key}`}
              aria-selected={selected}
              aria-controls={`config-panel-${key}`}
              tabIndex={selected ? 0 : -1}
              className={`${TAB_CLASSES} ${selected ? TAB_ACTIVE : TAB_IDLE}`}
              onClick={() => setTab(key)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {label}
            </button>
          );
        })}
      </div>

      {body}
    </section>
  );
}
