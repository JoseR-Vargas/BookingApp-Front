import { useEffect, useId } from 'react';
import { APP_CONFIG } from '../../config/appConfig.js';
import { useAvailableTimes } from '../../hooks/useAvailableTimes.js';
import { useBooking } from '../../state/bookingState.jsx';
import { formatLongDateUTC, formatMoney } from '../../utils/format.js';
import { getCommonProfessionalIds, getServiceIds, getTotalDuration, getTotalPrice } from '../../utils/serviceSelection.js';
import DatePicker from '../ui/DatePicker.jsx';
import Select from '../ui/Select.jsx';
import { FIELD_LABEL, HELP_TEXT, INPUT_LG, SELECT_LG, SELECT_TOGGLE_LG } from './fieldStyles.js';
import ProfessionalCard from './ProfessionalCard.jsx';
import StepHeading from './StepHeading.jsx';

// Legacy setupDateValidation: the earliest selectable date is "today" (as an ISO date).
const todayISO = () => new Date().toISOString().split('T')[0];

// Legacy updateServiceInfo(): recap of what has been chosen so far (every service, totals included).
function SelectedServiceInfo({ services, date, time, professional }) {
  const dateText = date ? formatLongDateUTC(date) : 'No seleccionada';

  return (
    <div
      data-testid="selected-service-info"
      className="mb-4 grid rounded-[0.375rem] border border-border bg-bg-tertiary p-4 text-text-secondary md:grid-cols-2 md:gap-x-6 lte-md:mb-2 lte-md:p-3 lte-md:text-[0.9rem] lte-md:leading-snug"
    >
      <div>
        <strong>Servicios:</strong>
        <ul className="mb-1 list-disc pl-5">
          {services.map((service) => (
            <li key={service.id}>{service.name}</li>
          ))}
        </ul>
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
  const { state, setDate, setTime, setProfessional } = useBooking();
  const { selectedServices, selectedDate, selectedTime, selectedProfessional } = state;
  const helperId = useId();

  const times = useAvailableTimes(
    selectedDate,
    selectedProfessional ? selectedProfessional.id : null,
    getServiceIds(selectedServices),
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
  const professionals = APP_CONFIG.PROFESSIONALS.filter((p) => commonProfessionalIds.includes(p.id));

  return (
    <div>
      <StepHeading title="Fecha y Hora" subtitle="Selecciona cuándo quieres tu cita" />

      <div className="grid md:grid-cols-2 md:gap-x-6">
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
            Los horarios se actualizarán después de seleccionar un profesional
          </div>
        </div>
      </div>

      <div className="mt-4">
        <label className={FIELD_LABEL}>Elige tu Profesional</label>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lte-md:gap-2">
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
          />
        )}
      </div>
    </div>
  );
}
