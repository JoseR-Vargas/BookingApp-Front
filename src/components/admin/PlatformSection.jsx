// "Negocios" section of the panel (spec 25): the owner of the system sees every business with its
// signals (plan, trial, bookings, storage) and can suspend it, reactivate it, extend its trial or
// change its plan by hand. The platform key is separate from the admin key of a business.

import { useCallback, useEffect, useState } from 'react';
import {
  changePlan,
  extendTrial,
  getBusiness,
  getPlatformMetrics,
  hasPlatformKey,
  listBusinesses,
  reactivateBusiness,
  setPlatformKey,
  suspendBusiness,
} from '../../services/platformService.js';
import { PLANS, STATUS_LABELS, planName } from '../../billing/plans.js';
import { toast } from '../../ui/toast.js';
import Button from '../ui/Button.jsx';
import Spinner from '../ui/Spinner.jsx';
import {
  TABLE, TABLE_SCROLL, TABLE_WRAPPER, TBODY, TD, TD_ACTIONS, TD_FIRST, TH, TH_END, TH_START, TR,
} from './tableStyles.js';
import { CONTROL, Field, FormError } from './config/configParts.jsx';

const MB = 1024 * 1024;
const megabytes = (bytes) => (bytes === null || bytes === undefined ? '—' : `${(bytes / MB).toFixed(1)} MB`);
const date = (iso) => (iso ? new Date(iso).toLocaleDateString('es-UY', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

function KeyForm({ onReady }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      setPlatformKey(key.trim());
      await listBusinesses();
      onReady();
    } catch (err) {
      setPlatformKey('');
      setError(err.message || 'La clave no es válida.');
    }
  };

  return (
    <form onSubmit={submit} className="mb-6 max-w-md">
      <Field id="platform-key" label="Clave de plataforma" className="mb-3">
        <input
          id="platform-key"
          data-testid="platform-key-input"
          type="password"
          value={key}
          autoComplete="off"
          onChange={(event) => setKey(event.target.value)}
          className={CONTROL}
        />
      </Field>
      <FormError message={error} testId="platform-key-error" />
      <Button type="submit" size="sm">Ver los negocios</Button>
    </form>
  );
}

export default function PlatformSection() {
  const [state, setState] = useState(undefined);
  const [metrics, setMetrics] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const [list, agg] = await Promise.all([listBusinesses(), getPlatformMetrics()]);
      setState(list.businesses || []);
      setMetrics(agg);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (key, action, success) => {
    setBusy(key);
    try {
      await action();
      toast.success(success);
      await load();
      if (selected) await openDetail(selected.id);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  const openDetail = async (id) => {
    try {
      setSelected(await getBusiness(id));
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (!hasPlatformKey()) {
    return (
      <section aria-label="Negocios">
        <KeyForm onReady={load} />
      </section>
    );
  }

  if (error) {
    return (
      <div role="alert" className="flex flex-col items-center gap-4 py-12 text-center text-text-secondary">
        <p>{error}</p>
        <Button size="sm" onClick={load}>Reintentar</Button>
      </div>
    );
  }

  if (state === undefined) {
    return (
      <div className="flex items-center justify-center gap-3 py-12 text-text-secondary">
        <Spinner />
        <span>Cargando negocios...</span>
      </div>
    );
  }

  return (
    <section aria-label="Negocios">
      {metrics && (
        <div data-testid="platform-metrics" className="mb-6 grid grid-cols-2 gap-4 rounded-lg border border-border bg-accent-muted p-4 text-sm md:grid-cols-4">
          <div><strong>{metrics.businesses.total}</strong> negocios</div>
          <div><strong>{metrics.businesses.active}</strong> activos</div>
          <div><strong>{metrics.businesses.inTrial}</strong> en prueba</div>
          <div><strong>{metrics.bookings.thisMonth}</strong> reservas este mes</div>
        </div>
      )}

      <div className={TABLE_WRAPPER}>
        <div className={TABLE_SCROLL}>
          <table className={TABLE} data-testid="platform-tenants">
            <thead>
              <tr>
                <th className={TH_START}>Negocio</th>
                <th className={TH}>Plan</th>
                <th className={TH}>Prueba</th>
                <th className={TH}>Reservas</th>
                <th className={TH}>Almacenamiento</th>
                <th className={TH}>Estado</th>
                <th className={TH_END}>Acciones</th>
              </tr>
            </thead>
            <tbody className={TBODY}>
              {state.map((business) => (
                <tr key={business.id} className={TR} data-testid={`platform-tenant-${business.slug}`}>
                  <td className={TD_FIRST}>
                    <button type="button" className="text-accent underline" onClick={() => openDetail(business.id)}>
                      {business.name}
                    </button>
                    <small className="block text-text-secondary">/n/{business.slug}</small>
                  </td>
                  <td className={TD}>{business.plan ? planName(business.plan.id) : '—'}</td>
                  <td className={TD}>
                    {business.trial
                      ? `${business.trial.daysLeft} días (${date(business.trial.endsAt)})`
                      : '—'}
                  </td>
                  <td className={TD}>{business.bookingsThisMonth}</td>
                  <td className={TD}>{megabytes(business.storage && business.storage.usedBytes)}</td>
                  <td className={TD}>{business.status === 'suspended' ? 'Suspendido' : 'Activo'}</td>
                  <td className={TD_ACTIONS}>
                    <div className="flex flex-wrap justify-end gap-2">
                      {business.status === 'active' ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy !== ''}
                          onClick={() => act(`suspend-${business.id}`, () => suspendBusiness(business.id), 'Negocio suspendido')}
                        >
                          Suspender
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={busy !== ''}
                          onClick={() => act(`reactivate-${business.id}`, () => reactivateBusiness(business.id), 'Negocio reactivado')}
                        >
                          Reactivar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div data-testid="platform-detail" className="mt-8 rounded-lg border border-border p-4">
          <h3 className="mb-3 text-lg font-bold">{selected.business.name}</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <h4 className="mb-2 font-semibold">Prueba</h4>
              <form
                className="flex items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const days = Number(event.currentTarget.elements.days.value);
                  act(`trial-${selected.business.id}`, () => extendTrial(selected.business.id, days), 'Prueba extendida');
                }}
              >
                <Field id="trial-days" label="Días">
                  <input id="trial-days" name="days" type="number" min="1" max="365" defaultValue="7" className={CONTROL} />
                </Field>
                <Button type="submit" size="sm" disabled={busy !== ''}>Extender</Button>
              </form>
            </div>
            <div>
              <h4 className="mb-2 font-semibold">Plan</h4>
              <div className="flex items-end gap-2">
                <Field id="business-plan" label="Plan">
                  <select id="business-plan" className={CONTROL} defaultValue={selected.business.plan ? selected.business.plan.id : 'pro'}>
                    {PLANS.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                  </select>
                </Field>
                <Button
                  size="sm"
                  disabled={busy !== ''}
                  onClick={() => {
                    const planId = document.getElementById('business-plan').value;
                    act(`plan-${selected.business.id}`, () => changePlan(selected.business.id, planId), 'Plan cambiado');
                  }}
                >
                  Cambiar
                </Button>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <h4 className="mb-2 font-semibold">Reservas del mes</h4>
            <p className="text-sm text-text-secondary">
              {selected.breakdown.professionals.length} profesionales, {selected.breakdown.services.length} servicios,{' '}
              {selected.breakdown.locations.length} locales con reservas. Catálogo: {selected.breakdown.catalog.professionals} profesionales,{' '}
              {selected.breakdown.catalog.services} servicios, {selected.breakdown.catalog.locations} locales.
            </p>
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="secondary" size="sm" onClick={() => setSelected(null)}>Cerrar</Button>
          </div>
        </div>
      )}
    </section>
  );
}
