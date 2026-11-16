import { useBooking } from '../../state/bookingState.jsx';
import { useCatalog } from '../../state/catalogState.jsx';
import { canAddService } from '../../utils/serviceSelection.js';
import ServiceSelectionCard from './ServiceSelectionCard.jsx';
import ServiceSelectionSummary from './ServiceSelectionSummary.jsx';
import StepHeading from './StepHeading.jsx';

/** Step 1: pick one or several services. The user advances with the footer "Siguiente" button. */
export default function ServiceSelectionStep() {
  const { state, toggleService } = useBooking();
  const { selectedServices } = state;
  const { services, professionals } = useCatalog();

  const isSelected = (service) => selectedServices.some((selected) => selected.id === service.id);

  return (
    <div>
      <StepHeading title="Elige tu Servicio" subtitle="Selecciona uno o varios servicios para tu cita" />
      <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @3xl:grid-cols-3 cq-compact:gap-2">
        {services.map((service) => {
          const selected = isSelected(service);
          return (
            <ServiceSelectionCard
              key={service.id}
              service={service}
              professionals={professionals}
              selected={selected}
              disabled={!selected && !canAddService(selectedServices, service)}
              onSelect={toggleService}
            />
          );
        })}
      </div>
      <ServiceSelectionSummary services={selectedServices} />
    </div>
  );
}
