/** One selectable professional in step 2 (legacy renderProfessionalCard). */
export default function ProfessionalCard({ professional, selected, onSelect }) {
  return (
    <button
      type="button"
      data-testid={`professional-card-${professional.id}`}
      aria-pressed={selected}
      onClick={() => onSelect({ id: professional.id, name: professional.name })}
      className={`flex h-full w-full cursor-pointer items-start rounded-lg border-2 p-6 text-center text-text-primary transition-all duration-300 ease-[ease] hover:-translate-y-[3px] hover:border-accent hover:shadow-md pointer-coarse:min-h-11 pointer-coarse:min-w-11 lte-md:p-3 ${
        selected
          ? 'border-accent bg-accent-muted shadow-accent hover:shadow-accent'
          : 'border-border-subtle bg-bg-tertiary'
      }`}
    >
      {/* One wrapper so the content stays top-aligned (a <button> would center it vertically).
          On <=768px (mobile-first usage) the card becomes a compact row: avatar | name, specialty, stats. */}
      <div className="w-full lte-md:flex lte-md:items-center lte-md:gap-3 lte-md:text-left">
        <div
          aria-hidden="true"
          className="mx-auto mb-4 flex size-[60px] items-center justify-center rounded-full border-2 border-accent bg-accent-muted text-[1.5rem] text-accent lte-md:mx-0 lte-md:mb-0 lte-md:size-10 lte-md:shrink-0 lte-md:text-base"
        >
          <i className={professional.avatar} />
        </div>
        <div className="lte-md:min-w-0 lte-md:flex-1">
          <h6 className="mb-2 font-semibold text-text-primary lte-md:mb-0 lte-md:text-[0.95rem] lte-md:leading-snug">
            {professional.name}
          </h6>
          <p className="mb-2 text-[0.9rem] leading-loose text-text-secondary lte-md:mb-0.5 lte-md:text-[0.85rem] lte-md:leading-snug">
            {professional.specialty}
          </p>
          <div className="flex justify-center gap-4 text-text-muted lte-md:justify-start lte-md:gap-3 lte-md:text-[0.8rem]">
            <small className="text-[0.875em] text-text-secondary lte-md:text-[0.8rem]">
              <i aria-hidden="true" className="fas fa-star text-accent" /> {professional.rating}
            </small>
            <small className="ml-2 text-[0.875em] text-text-secondary lte-md:ml-0 lte-md:text-[0.8rem]">
              <i aria-hidden="true" className="fas fa-clock" /> {professional.experience}
            </small>
          </div>
        </div>
      </div>
    </button>
  );
}
