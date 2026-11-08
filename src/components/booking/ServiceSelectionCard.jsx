import { formatMoney } from '../../utils/format.js';

// Icon rules of the legacy `.service-selection-card i` (they also hit the clock inside `.duration`).
// Font Awesome makes `<i class="fas">` inline-block, so the legacy `margin-bottom: 1rem` does apply to both icons.
// On <=768px the card turns into a compact row (see below), so the icons shrink and lose their bottom margin.
const ICON_SIZE = 'text-[3rem] text-accent lte-md:text-[1.1rem]';

/**
 * One selectable service in step 1 (legacy renderServiceSelectionCard).
 * `professionals` is the full catalog, used only to turn professional ids into names.
 *
 * Layout: centered stacked card on desktop; on <=768px (mobile-first usage) a compact row
 * (icon | name + price / description / duration + professionals) so at least two services
 * fit on screen without scrolling.
 */
export default function ServiceSelectionCard({ service, professionals, selected, onSelect }) {
  const professionalNames = service.professionals
    .map((id) => {
      const professional = professionals.find((p) => p.id === id);
      return professional ? professional.name : id;
    })
    .join(', ');

  return (
    <button
      type="button"
      data-testid={`service-card-${service.id}`}
      aria-pressed={selected}
      onClick={() => onSelect(service)}
      className={`flex h-full w-full cursor-pointer items-start rounded-lg border-2 p-6 text-center text-text-primary transition-all duration-300 ease-[ease] hover:-translate-y-[3px] hover:border-accent hover:shadow-md pointer-coarse:min-h-11 pointer-coarse:min-w-11 lte-md:p-3 ${
        selected
          ? 'border-accent bg-accent-muted shadow-accent hover:shadow-accent'
          : 'border-border-subtle bg-bg-tertiary'
      }`}
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
          </div>
        </div>
      </div>
    </button>
  );
}
