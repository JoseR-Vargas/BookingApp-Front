// "Recordatorios" tab (spec 24): when the business reminds its clients, through which channel, with which text,
// and how many went out (and how many failed). The backend sends them; this only configures and shows.

import { useCallback, useEffect, useState } from 'react';
import { getReminders, saveReminders } from '../../../services/adminService.js';
import { toast } from '../../../ui/toast.js';
import Button from '../../ui/Button.jsx';
import Spinner from '../../ui/Spinner.jsx';
import { ActiveBadge, CONTROL, Field, FormError, SaveButton } from './configParts.jsx';

const CHANNELS = [{ value: 'email', label: 'Correo' }];
const HOURS = [48, 24, 6, 3, 1];

const when = (iso) => new Date(iso).toLocaleString('es-UY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function RemindersTab() {
  const [state, setState] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const loaded = await getReminders();
      setState(loaded);
      setForm({
        enabled: loaded.config.enabled,
        channels: loaded.config.channels,
        hoursBefore: loaded.config.hoursBefore,
        template: loaded.config.template,
      });
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleChannel = (channel) => setForm((current) => ({
    ...current,
    channels: current.channels.includes(channel)
      ? current.channels.filter((one) => one !== channel)
      : [...current.channels, channel],
  }));

  const toggleHour = (hour) => setForm((current) => ({
    ...current,
    hoursBefore: current.hoursBefore.includes(hour)
      ? current.hoursBefore.filter((one) => one !== hour)
      : [...current.hoursBefore, hour].sort((a, b) => b - a),
  }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const saved = await saveReminders(form);
      setState(saved);
      toast.success('Recordatorios guardados');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!state || !form) {
    return error ? (
      <div role="alert" className="flex flex-col items-center gap-4 py-12 text-center text-text-secondary">
        <p>{error}</p>
        <Button size="sm" onClick={load}>Reintentar</Button>
      </div>
    ) : (
      <div className="flex items-center justify-center gap-3 py-12 text-text-secondary">
        <Spinner />
        <span>Cargando recordatorios...</span>
      </div>
    );
  }

  if (!state.allowsReminders) {
    return (
      <div role="status" className="rounded-lg border border-border bg-accent-muted p-4 text-sm">
        Tu plan no incluye recordatorios. <strong>Contrata un plan con recordatorios</strong> para avisar a tus clientes antes de su cita.
      </div>
    );
  }

  return (
    <div>
      <div data-testid="reminders-counters" className="mb-6 rounded-lg border border-border bg-accent-muted p-4 text-sm">
        <strong>Últimos {state.counters.days} días:</strong> {state.counters.sent} enviados, {state.counters.failed} fallidos.
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-4">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              data-testid="reminders-enabled"
              checked={form.enabled}
              onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
              className="size-4 accent-[var(--color-accent)]"
            />
            <span>Enviar recordatorios antes de la cita</span>
          </label>
        </div>

        <fieldset className="mb-4">
          <legend className="mb-2 text-sm font-semibold tracking-wide text-text-secondary">Canales</legend>
          <div className="flex flex-wrap gap-4">
            {CHANNELS.map((channel) => (
              <label key={channel.value} className="flex cursor-pointer items-center gap-2 text-text-primary">
                <input
                  type="checkbox"
                  data-testid={`reminders-channel-${channel.value}`}
                  checked={form.channels.includes(channel.value)}
                  onChange={() => toggleChannel(channel.value)}
                  className="size-4 accent-[var(--color-accent)]"
                />
                <span>{channel.label}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-text-secondary">Se avisa por correo a los clientes que dejaron un correo. Los que no lo dejaron no reciben nada.</p>
        </fieldset>

        <fieldset className="mb-4">
          <legend className="mb-2 text-sm font-semibold tracking-wide text-text-secondary">Con cuánta anticipación</legend>
          <div className="flex flex-wrap gap-4">
            {HOURS.map((hour) => (
              <label key={hour} className="flex cursor-pointer items-center gap-2 text-text-primary">
                <input
                  type="checkbox"
                  data-testid={`reminders-hour-${hour}`}
                  checked={form.hoursBefore.includes(hour)}
                  onChange={() => toggleHour(hour)}
                  className="size-4 accent-[var(--color-accent)]"
                />
                <span>{hour} {hour === 1 ? 'hora' : 'horas'}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field id="reminders-template" label="Mensaje" className="mb-4">
          <textarea
            id="reminders-template"
            data-testid="reminders-template-input"
            rows={4}
            value={form.template}
            onChange={(event) => setForm((current) => ({ ...current, template: event.target.value }))}
            className={CONTROL}
          />
        </Field>
        <p className="mb-4 text-xs text-text-secondary">
          Marcadores: {'{cliente}'}, {'{fecha}'}, {'{hora}'}, {'{profesional}'}, {'{negocio}'}, {'{cancelar}'}.
        </p>

        <FormError message={error} testId="reminders-error" />
        <div className="flex justify-end">
          <SaveButton saving={saving} testId="reminders-save">Guardar recordatorios</SaveButton>
        </div>
      </form>

      <div className="mt-8">
        <h3 className="mb-3 text-lg font-bold">Últimos enviados</h3>
        {state.recent.length === 0 ? (
          <p className="text-sm text-text-secondary">Todavía no se envió ningún recordatorio.</p>
        ) : (
          <ul data-testid="reminders-recent" className="divide-y divide-border-subtle">
            {state.recent.map((entry, index) => (
              <li key={`${entry.bookingId}-${entry.kind}-${index}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>{entry.kind} · {entry.channel} · {when(entry.sentAt)}</span>
                <span className="flex items-center gap-2">
                  {entry.ok
                    ? <ActiveBadge active />
                    : <span className="text-error">{entry.error || 'Falló'}</span>}
                  {entry.attempts > 1 && <span className="text-text-secondary">{entry.attempts} intentos</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
