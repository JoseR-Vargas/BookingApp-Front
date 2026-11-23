import { useEffect, useState } from 'react';
import { saveSchedule } from '../../../services/adminService.js';
import { toast } from '../../../ui/toast.js';
import { dayStartTimes, offeredStartTimes } from '../../../utils/schedule.js';
import Card from '../Card.jsx';
import { CONTROL, Field, FormError, SaveButton } from './configParts.jsx';

// Display order Monday..Sunday; `id` follows Date.getDay() (0 = Sunday), like the backend keys.
const DAYS = [
  { id: 1, name: 'Lunes' },
  { id: 2, name: 'Martes' },
  { id: 3, name: 'Miércoles' },
  { id: 4, name: 'Jueves' },
  { id: 5, name: 'Viernes' },
  { id: 6, name: 'Sábado' },
  { id: 0, name: 'Domingo' },
];

// Every start/end the backend accepts: 30-minute steps, 00:00 .. 23:30.
const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => (
  String(Math.floor(index / 2)).padStart(2, '0') + ':' + (index % 2 ? '30' : '00')
));

// Start interval offered to the public (SPEC 05): multiples of the 30-minute agenda grid, up to 8 hours.
const INTERVAL_OPTIONS = Array.from({ length: 16 }, (_, index) => (index + 1) * 30);
const DEFAULT_INTERVAL = 30;
const PREVIEW_LIMIT = 8;

const intervalLabel = (minutes) => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
};

const DEFAULT_OPEN = '09:00';
const DEFAULT_CLOSE = '18:00';

// A closed day keeps usable hours in the form so reopening it never starts from an invalid state.
function toFormState(schedule) {
  const weekly = (schedule && schedule.weekly) || {};
  return Object.fromEntries(DAYS.map(({ id }) => {
    const day = weekly[id] || { closed: true };
    return [id, {
      closed: Boolean(day.closed),
      open: day.open || DEFAULT_OPEN,
      close: day.close || DEFAULT_CLOSE,
      // null = the day follows the general interval; a list = its own start times (SPEC 06).
      starts: Array.isArray(day.starts) && day.starts.length > 0 ? day.starts : null,
    }];
  }));
}

const toPayload = (days) => Object.fromEntries(DAYS.map(({ id }) => {
  const { closed, open, close, starts } = days[id];
  if (closed) return [id, { closed: true }];
  return [id, starts ? { closed: false, open, close, starts: [...starts].sort() } : { closed: false, open, close }];
}));

// Every 30-minute block of a day that can be a start: from opening up to (not including) closing.
const gridTimes = (open, close) => TIME_OPTIONS.filter((time) => time >= open && time < close);
const keepInside = (starts, open, close) => starts.filter((time) => time >= open && time < close);

// 'HH:mm' strings compare correctly as text.
function findInvalidDay(days) {
  return DAYS.find(({ id }) => !days[id].closed && days[id].open >= days[id].close);
}

const findEmptyStarts = (days) => DAYS.find(({ id }) => !days[id].closed && days[id].starts && days[id].starts.length === 0);

const affectedMessage = (count) => (count === 1
  ? '1 reserva futura queda fuera del nuevo horario. No se modificó.'
  : `${count} reservas futuras quedan fuera del nuevo horario. No se modificaron.`);

function TimeSelect({ id, label, testId, value, disabled, onChange }) {
  return (
    <>
      <label htmlFor={id} className="sr-only">{label}</label>
      <select id={id} data-testid={testId} className={CONTROL} value={value} disabled={disabled} onChange={onChange}>
        {TIME_OPTIONS.map((time) => <option key={time} value={time}>{time}</option>)}
      </select>
    </>
  );
}

export default function ScheduleTab({ schedule, services = [], onChanged }) {
  const [days, setDays] = useState(() => toFormState(schedule));
  const [interval, setIntervalMinutes] = useState((schedule && schedule.startIntervalMinutes) || DEFAULT_INTERVAL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [affected, setAffected] = useState(0);

  // After a save the parent reloads the catalog: the form shows what the backend now holds.
  useEffect(() => {
    setDays(toFormState(schedule));
    setIntervalMinutes((schedule && schedule.startIntervalMinutes) || DEFAULT_INTERVAL);
  }, [schedule]);

  // The longest ACTIVE service tells the admin which interval makes sense (services of 3 h need 3 h turns).
  const longestService = services
    .filter((service) => service.active !== false)
    .reduce((longest, service) => Math.max(longest, service.duration || 0), 0);

  // What the public will see on the first open day, from the hours currently in the form.
  const previewDay = DAYS.find(({ id }) => !days[id].closed);
  const previewTimes = previewDay ? dayStartTimes({ ...days[previewDay.id], starts: days[previewDay.id].starts || undefined }, interval) : [];

  const update = (id, changes) => {
    setDays((current) => {
      const next = { ...current[id], ...changes };
      // Hours changed: a custom list never keeps a start that is no longer inside the day.
      if (next.starts && ('open' in changes || 'close' in changes)) next.starts = keepInside(next.starts, next.open, next.close);
      return { ...current, [id]: next };
    });
    setAffected(0);
    setError('');
  };

  // Turning customization on starts from what the public sees today; off goes back to the interval.
  const toggleCustom = (id, enabled) => update(id, {
    starts: enabled ? offeredStartTimes(days[id].open, days[id].close, interval) : null,
  });

  const toggleStart = (id, time) => {
    const current = days[id].starts;
    update(id, { starts: current.includes(time) ? current.filter((item) => item !== time) : [...current, time].sort() });
  };

  // The other open days take this day's list, limited to what fits each day's hours.
  const copyStarts = (sourceId) => {
    const { starts } = days[sourceId];
    setDays((current) => Object.fromEntries(DAYS.map(({ id }) => {
      const day = current[id];
      if (id === sourceId || day.closed) return [id, day];
      const fitting = keepInside(starts, day.open, day.close);
      return [id, fitting.length > 0 ? { ...day, starts: fitting } : day];
    })));
    setAffected(0);
    setError('');
  };

  const changeInterval = (event) => {
    setIntervalMinutes(Number(event.target.value));
    setAffected(0);
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const invalid = findInvalidDay(days);
    if (invalid) {
      setError(`${invalid.name}: la apertura debe ser anterior al cierre`);
      return;
    }

    const empty = findEmptyStarts(days);
    if (empty) {
      setError(`${empty.name}: marca al menos una hora o usa el intervalo general`);
      return;
    }

    setSaving(true);
    setError('');
    setAffected(0);
    try {
      const result = await saveSchedule(toPayload(days), interval);
      if (result && result.affectedBookings > 0) setAffected(result.affectedBookings);
      else toast.success('Horarios guardados');
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-6 border-b border-table-line pb-6">
          <Field id="schedule-interval" label="Intervalo entre turnos" className="max-w-xs">
            <select id="schedule-interval" data-testid="schedule-interval" className={CONTROL} value={interval} onChange={changeInterval}>
              {INTERVAL_OPTIONS.map((minutes) => <option key={minutes} value={minutes}>{intervalLabel(minutes)}</option>)}
            </select>
          </Field>
          {longestService > 0 && (
            <p className="mt-1 text-xs text-text-muted">Tu servicio más largo dura {longestService} min.</p>
          )}
          <p data-testid="schedule-interval-preview" className="mt-2 text-sm text-text-secondary">
            {previewDay ? (
              <>
                Así lo verá el público el {previewDay.name}:{' '}
                {previewTimes.length > 0
                  ? `${previewTimes.slice(0, PREVIEW_LIMIT).join(', ')}${previewTimes.length > PREVIEW_LIMIT ? ' …' : ''}`
                  : 'revisa la apertura y el cierre.'}
              </>
            ) : (
              'No hay días abiertos.'
            )}
          </p>
        </div>

        <ul className="divide-y divide-table-line">
          {DAYS.map(({ id, name }) => {
            const day = days[id];
            return (
              <li key={id} className="grid grid-cols-1 items-center gap-3 py-3 md:grid-cols-[8rem_9rem_1fr_1fr]">
                <span className="font-semibold text-text-primary">{name}</span>
                <label htmlFor={`schedule-closed-${id}`} className="flex cursor-pointer items-center gap-2 text-text-secondary">
                  <input
                    id={`schedule-closed-${id}`}
                    data-testid={`schedule-closed-${id}`}
                    type="checkbox"
                    checked={day.closed}
                    onChange={(event) => update(id, { closed: event.target.checked })}
                    className="size-4 accent-[var(--color-accent)]"
                  />
                  <span>Cerrado<span className="sr-only"> {name}</span></span>
                </label>
                <div>
                  <TimeSelect
                    id={`schedule-open-${id}`}
                    label={`Apertura ${name}`}
                    testId={`schedule-open-${id}`}
                    value={day.open}
                    disabled={day.closed}
                    onChange={(event) => update(id, { open: event.target.value })}
                  />
                </div>
                <div>
                  <TimeSelect
                    id={`schedule-close-${id}`}
                    label={`Cierre ${name}`}
                    testId={`schedule-close-${id}`}
                    value={day.close}
                    disabled={day.closed}
                    onChange={(event) => update(id, { close: event.target.value })}
                  />
                </div>
                {!day.closed && (
                  <div className="md:col-span-4">
                    <label htmlFor={`schedule-custom-${id}`} className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
                      <input
                        id={`schedule-custom-${id}`}
                        data-testid={`schedule-custom-${id}`}
                        type="checkbox"
                        checked={Boolean(day.starts)}
                        onChange={(event) => toggleCustom(id, event.target.checked)}
                        className="size-4 accent-[var(--color-accent)]"
                      />
                      <span>Elegir las horas de este día<span className="sr-only"> {name}</span></span>
                    </label>
                    {day.starts && (
                      <div className="mt-2">
                        <ul className="flex flex-wrap gap-2" aria-label={`Horas de inicio ${name}`}>
                          {gridTimes(day.open, day.close).map((time) => (
                            <li key={time}>
                              <label className={`cursor-pointer rounded-md border px-2 py-1 text-sm ${day.starts.includes(time) ? 'border-accent bg-accent/10 text-text-primary' : 'border-table-line text-text-muted'}`}>
                                <input
                                  type="checkbox"
                                  data-testid={`schedule-start-${id}-${time}`}
                                  checked={day.starts.includes(time)}
                                  onChange={() => toggleStart(id, time)}
                                  className="sr-only"
                                />
                                {time}
                              </label>
                            </li>
                          ))}
                        </ul>
                        <button type="button" data-testid={`schedule-copy-${id}`} onClick={() => copyStarts(id)} className="mt-2 text-sm font-semibold text-accent hover:underline">
                          Copiar a los otros días
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <FormError message={error} testId="schedule-error" />
        {affected > 0 && (
          <p role="status" data-testid="schedule-warning" className="mt-4 rounded-md border border-warning bg-warning/10 p-3 text-sm text-warning">
            {affectedMessage(affected)}
          </p>
        )}
        <div className="mt-4 flex justify-end">
          <SaveButton saving={saving} testId="schedule-save">Guardar horarios</SaveButton>
        </div>
      </form>
    </Card>
  );
}
