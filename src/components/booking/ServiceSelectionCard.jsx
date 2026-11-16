import { formatMoney } from '../../utils/format.js';

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
      className={`mt-2 inline-flex size-7 items-center justify-center rounded-full border text-[0.75rem] cq-compact:mt-0 cq-compact:size-6 cq-compact:shrink-0 cq-compact:text-[0.7rem] ${state}`}
    >
      <i
        aria-hidden="true"
        data-testid={selected ? `service-check-${serviceId}` : undefined}
        className={`fas ${selected ? 'fa-check' : 'fa-plus'}`}
      />
      {/* Icon-only for sighted users; screen readers still get the state. */}
      <span className="sr-only">{selected ? 'Agregado' : 'Agregar'}</span>
    </span>
  );
}

/**
 * One toggleable service in step 1 (legacy renderServiceSelectionCard). Several can be selected.
 * `professionals` is the full catalog, used only to turn professional ids into names.
 * `disabled` greys the card out (adding it would leave no professional offering the whole selection).
 *
 * Layout: centered stacked card on desktop; on <=768px (mobile-first usage) a compact row
 * (name + price / description / duration + professionals) so at least two services
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
      className={`flex h-full w-full items-start rounded-lg border-2 p-6 text-center text-text-primary transition-all duration-300 ease-[ease] pointer-coarse:min-h-11 pointer-coarse:min-w-11 cq-compact:p-3 ${
        disabled ? '' : 'cursor-pointer hover:-translate-y-[3px] hover:border-accent hover:shadow-md'
      } ${cardState}`}
    >
      {/* One wrapper so the content stays top-aligned (a <button> would center it vertically). */}
      <div className="w-full cq-compact:flex cq-compact:items-start cq-compact:gap-3 cq-compact:text-left">
        <div className="cq-compact:grid cq-compact:min-w-0 cq-compact:flex-1 cq-compact:grid-cols-[1fr_auto] cq-compact:gap-x-2 cq-compact:gap-y-0.5">
          <h5 className="mb-2 text-[1.25rem] font-semibold text-text-primary cq-compact:mb-0 cq-compact:min-w-0 cq-compact:text-base cq-compact:leading-snug">
            {service.name}
          </h5>
          <p className="mb-4 leading-loose text-text-secondary cq-compact:order-3 cq-compact:col-span-2 cq-compact:mb-0 cq-compact:line-clamp-2 cq-compact:text-[0.85rem] cq-compact:leading-snug">
            {service.description}
          </p>
          <div className="mb-2 text-[1.2rem] font-bold text-accent cq-compact:order-2 cq-compact:mb-0 cq-compact:text-base cq-compact:leading-snug">
            {formatMoney(service.price)}
          </div>
          <div className="cq-compact:order-4 cq-compact:col-span-2 cq-compact:text-[0.75rem]">
            <div className="text-[0.9rem] text-text-muted cq-compact:text-[0.75rem]">
              {service.duration} minutos
            </div>
            {/* Mobile: professionals and the add toggle share one row (toggle at the right edge). */}
            <div className="cq-compact:flex cq-compact:items-center cq-compact:justify-between cq-compact:gap-2">
              <small className="text-[0.875em] text-text-secondary @3xl:block cq-compact:min-w-0 cq-compact:text-[0.75rem]">
                Profesionales: {professionalNames}
              </small>
              {!disabled && <AddToggle serviceId={service.id} selected={selected} />}
            </div>
            {disabled && (
              <small className="block text-[0.75rem] font-semibold text-text-secondary">{UNAVAILABLE_HINT}</small>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
