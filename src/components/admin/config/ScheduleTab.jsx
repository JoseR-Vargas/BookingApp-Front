import { useEffect, useState } from 'react';
import { saveSchedule } from '../../../services/adminService.js';
import { toast } from '../../../ui/toast.js';
import { offeredStartTimes } from '../../../utils/schedule.js';
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
    }];
  }));
}

const toPayload = (days) => Object.fromEntries(DAYS.map(({ id }) => {
  const { closed, open, close } = days[id];
  return [id, closed ? { closed: true } : { closed: false, open, close }];
}));

// 'HH:mm' strings compare correctly as text.
function findInvalidDay(days) {
  return DAYS.find(({ id }) => !days[id].closed && days[id].open >= days[id].close);
}

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
  const previewTimes = previewDay ? offeredStartTimes(days[previewDay.id].open, days[previewDay.id].close, interval) : [];

  const update = (id, changes) => {
    setDays((current) => ({ ...current, [id]: { ...current[id], ...changes } }));
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
