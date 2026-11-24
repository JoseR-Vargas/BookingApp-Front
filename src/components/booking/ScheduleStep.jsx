import { useEffect, useId } from 'react';
import { useAvailableTimes } from '../../hooks/useAvailableTimes.js';
import { useBooking } from '../../state/bookingState.jsx';
import { useCatalog } from '../../state/catalogState.jsx';
import { formatLongDateUTC, formatMoney } from '../../utils/format.js';
import { locationLabel } from '../../utils/locations.js';
import { getCommonProfessionalIds, getServiceIds, getTotalDuration, getTotalPrice } from '../../utils/serviceSelection.js';
import DatePicker from '../ui/DatePicker.jsx';
import Select from '../ui/Select.jsx';
import { FIELD_LABEL, HELP_TEXT, INPUT_LG, SELECT_LG, SELECT_TOGGLE_LG } from './fieldStyles.js';
import ProfessionalCard from './ProfessionalCard.jsx';
import StepHeading from './StepHeading.jsx';

// Legacy setupDateValidation: the earliest selectable date is "today" (as an ISO date).
const todayISO = () => new Date().toISOString().split('T')[0];

// Legacy updateServiceInfo(): recap of what has been chosen so far (every service, totals included).
function SelectedServiceInfo({ services, date, time, professional, location }) {
  const dateText = date ? formatLongDateUTC(date) : 'No seleccionada';

  return (
    <div
      data-testid="selected-service-info"
      className="mb-4 grid rounded-[0.375rem] border border-border bg-bg-tertiary p-4 text-text-secondary @3xl:grid-cols-2 @3xl:gap-x-6 cq-compact:mb-2 cq-compact:p-3 cq-compact:text-[0.9rem] cq-compact:leading-snug"
    >
      <div>
        <strong>Servicios:</strong>
        <ul className="mb-1 list-disc pl-5">
          {services.map((service) => (
            <li key={service.id}>{service.name}</li>
          ))}
        </ul>
        {location && (
          <>
            <strong>Local:</strong> {location.name}
            <br />
          </>
        )}
        <strong>Profesional:</strong> {professional ? professional.name : 'No seleccionado'}
        <br />
        <strong>Precio total:</strong> {formatMoney(getTotalPrice(services))}
      </div>
      <div>
        <strong>Fecha:</strong> {dateText}
        <br />
        <strong>Hora:</strong> {time || 'No seleccionada'}
        <br />
        <strong>Duración total:</strong> {getTotalDuration(services)} minutos
      </div>
    </div>
  );
}

/** Step 2: date, hour and professional. */
export default function ScheduleStep() {
  const { state, setDate, setTime, setProfessional, setLocation } = useBooking();
  const { selectedServices, selectedDate, selectedTime, selectedProfessional, selectedLocation } = state;
  const helperId = useId();
  const { professionals: allProfessionals, locations = [] } = useCatalog();
  // SPEC 08: only a business with several locations asks for one; with a single one nothing changes.
  const askLocation = locations.length > 1;

  const times = useAvailableTimes(
    selectedDate,
    selectedProfessional ? selectedProfessional.id : null,
    getServiceIds(selectedServices),
    askLocation && selectedLocation ? selectedLocation.id : undefined,
  );

  // Deliberate improvement: legacy kept a stale time in its state while the rebuilt <select>
  // showed nothing. Once the slots are final, a time that is no longer free is dropped.
  const freeTimes = times.slots.join(',');
  useEffect(() => {
    if (times.settled && selectedTime && !freeTimes.split(',').includes(selectedTime)) {
      setTime(null);
    }
  }, [times.settled, freeTimes, selectedTime, setTime]);

  const commonProfessionalIds = getCommonProfessionalIds(selectedServices);
  // A professional that carries no locations (older catalog) is offered everywhere.
  const worksAtLocation = (p) => !askLocation
    || (selectedLocation && (!Array.isArray(p.locations) || p.locations.includes(selectedLocation.id)));
  const professionals = allProfessionals.filter((p) => commonProfessionalIds.includes(p.id) && worksAtLocation(p));

  return (
    <div>
      <StepHeading title="Fecha y Hora" subtitle="Selecciona cuándo quieres tu cita" />

      {askLocation && (
        <div className="mb-4">
          <span id={`${helperId}-location`} className={FIELD_LABEL}>Local</span>
          <div role="radiogroup" aria-labelledby={`${helperId}-location`} className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
            {locations.map((location) => {
              const selected = selectedLocation?.id === location.id;
              return (
                <button
                  key={location.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-testid={`location-card-${location.id}`}
                  onClick={() => setLocation(location)}
                  className={`cursor-pointer rounded-lg border p-3 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent touch:min-h-11 ${selected ? 'border-accent bg-accent-muted text-text-primary' : 'border-border bg-bg-tertiary text-text-secondary hover:border-accent'}`}
                >
                  <span className="block font-semibold text-text-primary">{location.name}</span>
                  {location.address && <span className="block text-sm">{location.address}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid @3xl:grid-cols-2 @3xl:gap-x-6">
        <div>
          <label className={FIELD_LABEL}>Fecha de la Cita</label>
          <DatePicker
            ariaLabel="Fecha de la cita"
            className={`${INPUT_LG} cursor-pointer`}
            min={todayISO()}
            required
            placeholder="Selecciona una fecha"
            value={selectedDate || ''}
            onChange={(date) => setDate(date || null)}
          />
        </div>
        <div>
          <label className={FIELD_LABEL}>Hora Disponible</label>
          <Select
            ariaLabel="Hora de la cita"
            describedBy={helperId}
            required
            toggleClassName={SELECT_TOGGLE_LG}
            nativeClassName={SELECT_LG}
            placeholder={times.placeholder}
            options={times.slots.map((time) => ({ value: time, label: time }))}
            value={selectedTime || ''}
            onChange={(time) => setTime(time || null)}
          />
          <div id={helperId} className={HELP_TEXT}>
            Elige un profesional para ver sus horarios disponibles
          </div>
        </div>
      </div>

      <div className="mt-4">
        <label className={FIELD_LABEL}>Elige tu Profesional</label>
        {askLocation && !selectedLocation && (
          <p className="text-sm text-text-muted">Elige un local para ver los profesionales</p>
        )}
        <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2 @5xl:grid-cols-3 cq-compact:gap-2">
          {professionals.map((professional) => (
            <ProfessionalCard
              key={professional.id}
              professional={professional}
              selected={selectedProfessional?.id === professional.id}
              onSelect={setProfessional}
            />
          ))}
        </div>
      </div>

      <div className="mt-4">
        {selectedServices.length > 0 && (
          <SelectedServiceInfo
            services={selectedServices}
            date={selectedDate}
            time={selectedTime}
            professional={selectedProfessional}
            location={askLocation ? selectedLocation : null}
          />
        )}
      </div>
    </div>
  );
}
