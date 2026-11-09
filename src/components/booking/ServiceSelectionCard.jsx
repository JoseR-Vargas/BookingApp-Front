import { formatMoney } from '../../utils/format.js';

// Icon rules of the legacy `.service-selection-card i` (they also hit the clock inside `.duration`).
// Font Awesome makes `<i class="fas">` inline-block, so the legacy `margin-bottom: 1rem` does apply to both icons.
// On <=768px the card turns into a compact row (see below), so the icons shrink and lose their bottom margin.
const ICON_SIZE = 'text-[3rem] text-accent lte-md:text-[1.1rem]';

const UNAVAILABLE_HINT = 'Sin profesional en común con tu selección';

const CARD_STATE = {
  selected: 'border-accent bg-accent-muted shadow-accent hover:shadow-accent',
  available: 'border-border-subtle bg-bg-tertiary',
  unavailable: 'cursor-not-allowed border-border-subtle bg-bg-tertiary opacity-50',
};

/**
 * Visible affordance telling the client that services can be ADDED (several per booking):
 * "+ Agregar" while available, "Agregado" once in the selection. The whole card is the real
 * button, so this is a plain visual element (never a nested button).
 */
function AddToggle({ serviceId, selected }) {
  const state = selected
    ? 'border-accent bg-accent text-primary-foreground'
    : 'border-accent bg-transparent text-accent';
  return (
    <span
      className={`mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-[0.85rem] font-semibold lte-md:order-5 lte-md:col-span-2 lte-md:mt-1 lte-md:py-1 lte-md:text-[0.8rem] ${state}`}
    >
      <i
        aria-hidden="true"
        data-testid={selected ? `service-check-${serviceId}` : undefined}
        className={`fas ${selected ? 'fa-check' : 'fa-plus'}`}
      />
      {selected ? 'Agregado' : 'Agregar'}
    </span>
  );
}

/**
 * One toggleable service in step 1 (legacy renderServiceSelectionCard). Several can be selected.
 * `professionals` is the full catalog, used only to turn professional ids into names.
 * `disabled` greys the card out (adding it would leave no professional offering the whole selection).
 *
 * Layout: centered stacked card on desktop; on <=768px (mobile-first usage) a compact row
 * (icon | name + price / description / duration + professionals) so at least two services
 * fit on screen without scrolling.
 */
export default function ServiceSelectionCard({ service, professionals, selected, disabled = false, onSelect }) {
  const professionalNames = service.professionals
    .map((id) => {
      const professional = professionals.find((p) => p.id === id);
      return professional ? professional.name : id;
    })
    .join(', ');

  const cardState = selected ? CARD_STATE.selected : disabled ? CARD_STATE.unavailable : CARD_STATE.available;

  return (
    <button
      type="button"
      data-testid={`service-card-${service.id}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => onSelect(service)}
      className={`flex h-full w-full items-start rounded-lg border-2 p-6 text-center text-text-primary transition-all duration-300 ease-[ease] pointer-coarse:min-h-11 pointer-coarse:min-w-11 lte-md:p-3 ${
        disabled ? '' : 'cursor-pointer hover:-translate-y-[3px] hover:border-accent hover:shadow-md'
      } ${cardState}`}
    >
      {/* One wrapper so the content stays top-aligned (a <button> would center it vertically). */}
      <div className="w-full lte-md:flex lte-md:items-start lte-md:gap-3 lte-md:text-left">
        <i
          aria-hidden="true"
          className={`${service.icon} mb-4 ${ICON_SIZE} lte-md:mt-0.5 lte-md:mb-0 lte-md:w-6 lte-md:shrink-0 lte-md:text-center`}
        />
        <div className="lte-md:grid lte-md:min-w-0 lte-md:flex-1 lte-md:grid-cols-[1fr_auto] lte-md:gap-x-2 lte-md:gap-y-0.5">
          <h5 className="mb-2 text-[1.25rem] font-semibold text-text-primary lte-md:mb-0 lte-md:min-w-0 lte-md:text-base lte-md:leading-snug">
            {service.name}
          </h5>
          <p className="mb-4 leading-loose text-text-secondary lte-md:order-3 lte-md:col-span-2 lte-md:mb-0 lte-md:line-clamp-2 lte-md:text-[0.85rem] lte-md:leading-snug">
            {service.description}
          </p>
          <div className="mb-2 text-[1.2rem] font-bold text-accent lte-md:order-2 lte-md:mb-0 lte-md:text-base lte-md:leading-snug">
            {formatMoney(service.price)}
          </div>
          <div className="lte-md:order-4 lte-md:col-span-2 lte-md:flex lte-md:flex-wrap lte-md:items-center lte-md:gap-x-3 lte-md:text-[0.75rem]">
            <div className="text-[0.9rem] text-text-muted lte-md:text-[0.75rem]">
              <i aria-hidden="true" className={`fas fa-clock mr-1 mb-4 ${ICON_SIZE} lte-md:mb-0 lte-md:text-[0.75rem]`} />
              {service.duration} minutos
            </div>
            <small className="text-[0.875em] text-text-secondary lte-md:text-[0.75rem]">
              Profesionales: {professionalNames}
            </small>
            {disabled && (
              <small className="block text-[0.75rem] font-semibold text-text-secondary">{UNAVAILABLE_HINT}</small>
            )}
          </div>
          {!disabled && <AddToggle serviceId={service.id} selected={selected} />}
        </div>
      </div>
    </button>
  );
}
