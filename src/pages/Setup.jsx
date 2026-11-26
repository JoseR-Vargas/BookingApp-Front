// Setup wizard (/n/<slug>/asistente, spec 21): services, professionals, hours and the public page. Every step
// saves by itself (it reuses the tabs of the configuration), every step can be skipped and the visitor can go
// back. Nothing here is required: the panel is always one click away.

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ProfessionalsTab from '../components/admin/config/ProfessionalsTab.jsx';
import ScheduleTab from '../components/admin/config/ScheduleTab.jsx';
import ServicesTab from '../components/admin/config/ServicesTab.jsx';
import ShareTab from '../components/admin/config/ShareTab.jsx';
import BrandMark from '../components/ui/BrandMark.jsx';
import Button from '../components/ui/Button.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import { getAdminCatalog } from '../services/adminService.js';
import { useTenantPath } from '../tenancy/tenant-context.jsx';
import { toast } from '../ui/toast.js';

const STEPS = [
  { key: 'services', title: 'Tus servicios', help: 'Qué ofreces, cuánto dura y cuánto cuesta.' },
  { key: 'professionals', title: 'Tu equipo', help: 'Las personas que atienden. Puedes agregar más después.' },
  { key: 'schedule', title: 'Tus horarios', help: 'Los días y horas en que atiendes.' },
  { key: 'share', title: 'Tu página pública', help: 'Qué días y servicios ve tu cliente para reservar.' },
];

export default function Setup() {
  const tenantLink = useTenantPath();
  const [index, setIndex] = useState(0);
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      setCatalog(await getAdminCatalog());
      setError('');
    } catch (err) {
      if (silent) toast.error(err.message);
      else setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const refresh = useCallback(() => load({ silent: true }), [load]);

  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  let body;
  if (error) {
    body = (
      <div role="alert" className="py-8 text-center text-text-secondary">
        <p className="mb-4">{error}</p>
        <Button size="sm" onClick={() => load()}>Reintentar</Button>
      </div>
    );
  } else if (!catalog) {
    body = (
      <div className="flex items-center justify-center gap-3 py-12 text-text-secondary">
        <Spinner />
        <span>Cargando...</span>
      </div>
    );
  } else if (step.key === 'services') {
    body = <ServicesTab services={catalog.services} professionals={catalog.professionals} onChanged={refresh} />;
  } else if (step.key === 'professionals') {
    body = <ProfessionalsTab professionals={catalog.professionals} locations={catalog.locations} onChanged={refresh} />;
  } else if (step.key === 'schedule') {
    body = <ScheduleTab schedule={catalog.schedule} locations={catalog.locations} services={catalog.services} onChanged={refresh} />;
  } else {
    body = <ShareTab publicAvailability={catalog.publicAvailability} services={catalog.services} onChanged={refresh} />;
  }

  return (
    <main className="mx-auto min-h-screen-dvh max-w-4xl bg-bg-primary px-4 py-8">
      <header className="mb-6 text-center">
        <h1 className="mb-1 font-display text-2xl font-bold"><BrandMark logoClassName="h-[1.2em] w-[1.2em]" /></h1>
        <p className="text-text-secondary">Configura tu negocio. Todo es opcional y se guarda solo.</p>
      </header>

      <ol className="mb-6 flex flex-wrap justify-center gap-2" aria-label="Pasos">
        {STEPS.map((item, position) => (
          <li key={item.key}>
            <button
              type="button"
              data-testid={`setup-step-${item.key}`}
              aria-current={position === index ? 'step' : undefined}
              onClick={() => setIndex(position)}
              className={`cursor-pointer rounded-full border px-4 py-1 text-sm ${position === index ? 'border-accent text-accent' : 'border-border text-text-secondary'}`}
            >
              {position + 1}. {item.title}
            </button>
          </li>
        ))}
      </ol>

      <section aria-label={step.title}>
        <h2 className="mb-1 text-xl font-bold">{step.title}</h2>
        <p className="mb-4 text-text-secondary">{step.help}</p>
        {body}
      </section>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" size="sm" disabled={index === 0} onClick={() => setIndex(index - 1)}>Atrás</Button>
        <div className="flex gap-2">
          <Link to={tenantLink('/admin')} className="self-center text-sm text-text-secondary underline">Ir al panel</Link>
          {last ? (
            <Button size="sm" href={tenantLink('/admin')}>Terminar</Button>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={() => setIndex(index + 1)}>Saltar</Button>
              <Button size="sm" onClick={() => setIndex(index + 1)}>Siguiente</Button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
