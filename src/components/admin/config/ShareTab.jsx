import { useEffect, useState } from 'react';
import { savePublicAvailability } from '../../../services/adminService.js';
import { toast } from '../../../ui/toast.js';
import Button from '../../ui/Button.jsx';
import Card from '../Card.jsx';
import { CONTROL, Field, FormError, SaveButton } from './configParts.jsx';

const DEFAULTS = { enabled: false, days: 7, serviceIds: null };
const DAY_OPTIONS = Array.from({ length: 14 }, (_, index) => index + 1);
const PUBLIC_PATH = '/disponibilidad';

const fromSettings = (settings) => {
  const { enabled, days, serviceIds } = settings || DEFAULTS;
  return { enabled, days, serviceIds };
};

/**
 * SPEC 07: what the public availability page (/disponibilidad) publishes, and its link. `serviceIds`
 * null means every active service (a new service is then published by itself).
 */
export default function ShareTab({ publicAvailability, services, onChanged }) {
  const [form, setForm] = useState(() => fromSettings(publicAvailability));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // After a save the parent reloads the catalog: the form shows what the backend now holds.
  useEffect(() => { setForm(fromSettings(publicAvailability)); }, [publicAvailability]);

  const link = `${window.location.origin}${PUBLIC_PATH}`;
  const activeServices = services.filter((service) => service.active !== false);
  const allServices = form.serviceIds === null;

  const change = (changes) => {
    setForm((current) => ({ ...current, ...changes }));
    setError('');
  };

  const toggleAll = (checked) => change({ serviceIds: checked ? null : activeServices.map((service) => service.id) });

  const toggleService = (id) => change({
    serviceIds: form.serviceIds.includes(id) ? form.serviceIds.filter((item) => item !== id) : [...form.serviceIds, id],
  });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Enlace copiado');
    } catch {
      // No clipboard API (insecure context) or denied: the link is also on screen.
      toast.error('No se pudo copiar el enlace. Cópialo manualmente.');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!allServices && form.serviceIds.length === 0) {
      setError('Elige al menos un servicio o publica todos');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await savePublicAvailability(form);
      toast.success('Configuración guardada');
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <div>
          <p className="mb-3 text-text-secondary">
            Un enlace público que muestra en tiempo real tus turnos libres. Pégalo en tus estados de WhatsApp o en la bio de Instagram.
          </p>
          <label htmlFor="share-enabled" className="flex cursor-pointer items-center gap-2 font-semibold text-text-primary">
            <input
              id="share-enabled"
              data-testid="share-enabled"
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => change({ enabled: event.target.checked })}
              className="size-4 accent-[var(--color-accent)]"
            />
            <span>Publicar la página de turnos</span>
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Field id="share-link" label="Enlace" className="min-w-0 flex-1">
            <input id="share-link" data-testid="share-link" className={CONTROL} value={link} readOnly onFocus={(event) => event.target.select()} />
          </Field>
          <Button type="button" size="sm" variant="secondary" onClick={copyLink}>Copiar enlace</Button>
          <Button size="sm" variant="secondary" href={PUBLIC_PATH} target="_blank" rel="noreferrer">Abrir</Button>
        </div>
        {!form.enabled && (
          <p className="-mt-3 text-xs text-text-muted">Mientras no la publiques, el enlace dice que la página no está disponible.</p>
        )}

        <Field id="share-days" label="Días a mostrar" className="max-w-xs">
          <select id="share-days" data-testid="share-days" className={CONTROL} value={form.days} onChange={(event) => change({ days: Number(event.target.value) })}>
            {DAY_OPTIONS.map((days) => <option key={days} value={days}>{days === 1 ? 'Solo hoy' : `${days} días`}</option>)}
          </select>
        </Field>

        <fieldset>
          <legend className="mb-2 font-semibold text-text-primary">Servicios que se muestran</legend>
          <label htmlFor="share-all-services" className="mb-2 flex cursor-pointer items-center gap-2 text-text-secondary">
            <input
              id="share-all-services"
              data-testid="share-all-services"
              type="checkbox"
              checked={allServices}
              onChange={(event) => toggleAll(event.target.checked)}
              className="size-4 accent-[var(--color-accent)]"
            />
            <span>Todos los servicios activos</span>
          </label>
          {!allServices && (
            <ul className="ml-6 space-y-1">
              {activeServices.map((service) => (
                <li key={service.id}>
                  <label htmlFor={`share-service-${service.id}`} className="flex cursor-pointer items-center gap-2 text-text-secondary">
                    <input
                      id={`share-service-${service.id}`}
                      data-testid={`share-service-${service.id}`}
                      type="checkbox"
                      checked={form.serviceIds.includes(service.id)}
                      onChange={() => toggleService(service.id)}
                      className="size-4 accent-[var(--color-accent)]"
                    />
                    <span>{service.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <FormError message={error} testId="share-error" />
        <div className="flex justify-end">
          <SaveButton saving={saving} testId="share-save">Guardar</SaveButton>
        </div>
      </form>
    </Card>
  );
}
