import ProfessionalAvatar from '../ui/ProfessionalAvatar.jsx';

/** One selectable professional in step 2 (legacy renderProfessionalCard). */
export default function ProfessionalCard({ professional, selected, onSelect }) {
  return (
    <button
      type="button"
      data-testid={`professional-card-${professional.id}`}
      aria-pressed={selected}
      onClick={() => onSelect({ id: professional.id, name: professional.name })}
      className={`flex h-full w-full cursor-pointer items-start rounded-lg border-2 p-6 text-center text-text-primary transition-all duration-300 ease-[ease] hover:-translate-y-[3px] hover:border-accent hover:shadow-md pointer-coarse:min-h-11 pointer-coarse:min-w-11 cq-compact:p-3 ${
        selected
          ? 'border-accent bg-accent-muted shadow-accent hover:shadow-accent'
          : 'border-border-subtle bg-bg-tertiary'
      }`}
    >
      {/* One wrapper so the content stays top-aligned (a <button> would center it vertically).
          On <=768px (mobile-first usage) the card becomes a compact row: name, specialty, stats. */}
      <div className="w-full cq-compact:flex cq-compact:items-center cq-compact:gap-3 cq-compact:text-left">
        <ProfessionalAvatar
          name={professional.name}
          photoUrl={professional.photoUrl}
          size="md"
          className="mx-auto mb-3 cq-compact:mx-0 cq-compact:mb-0"
        />
        <div className="cq-compact:min-w-0 cq-compact:flex-1">
          <h6 className="mb-2 font-semibold text-text-primary cq-compact:mb-0 cq-compact:text-[0.95rem] cq-compact:leading-snug">
            {professional.name}
          </h6>
          <p className="mb-2 text-[0.9rem] leading-loose text-text-secondary cq-compact:mb-0.5 cq-compact:text-[0.85rem] cq-compact:leading-snug">
            {professional.specialty}
          </p>
          <div className="flex justify-center gap-4 text-text-muted cq-compact:justify-start cq-compact:gap-3 cq-compact:text-[0.8rem]">
            <small className="text-[0.875em] text-text-secondary cq-compact:text-[0.8rem]">
              {professional.rating}
            </small>
            <small className="ml-2 text-[0.875em] text-text-secondary cq-compact:ml-0 cq-compact:text-[0.8rem]">
              {professional.experience}
            </small>
          </div>
        </div>
      </div>
    </button>
  );
}
