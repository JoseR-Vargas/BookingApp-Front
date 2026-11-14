// Centered title + subtitle shared by the three booking steps (legacy `h4` + `p.text-muted`).
export default function StepHeading({ title, subtitle }) {
  return (
    <div className="mb-6 text-center lte-md:mb-3">
      <h4 className="mb-2 text-[length:calc(1.275rem+0.3vw)] leading-tight xl:text-xl lte-md:mb-1 lte-sm:text-[1.15rem]">
        {title}
      </h4>
      <p className="mb-4 leading-loose text-text-secondary lte-md:mb-0 lte-md:leading-snug lte-sm:text-[0.85rem]">
        {subtitle}
      </p>
    </div>
  );
}
