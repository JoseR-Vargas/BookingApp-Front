// Centered title + subtitle shared by the three booking steps (legacy `h4` + `p.text-muted`).
export default function StepHeading({ title, subtitle }) {
  return (
    <div className="mb-6 text-center cq-compact:mb-3">
      <h4 className="mb-2 text-[length:calc(1.275rem+0.3vw)] leading-tight @7xl:text-xl cq-compact:mb-1 cq-lte-sm:text-[1.15rem]">
        {title}
      </h4>
      <p className="mb-4 leading-loose text-text-secondary cq-compact:mb-0 cq-compact:leading-snug cq-lte-sm:text-[0.85rem]">
        {subtitle}
      </p>
    </div>
  );
}
