export default function StatCard({ value, label }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center gap-4 rounded-lg border border-border-subtle bg-bg-secondary p-6 shadow-sm transition-all duration-300 ease-[ease] hover:-translate-y-0.5 hover:border-border hover:shadow-md lte-md:flex-col lte-md:text-center"
    >
      <div>
        <h3 className="m-0 font-display text-2xl font-bold text-text-primary">{value}</h3>
        <p className="m-0 text-sm leading-loose text-text-secondary">{label}</p>
      </div>
    </div>
  );
}
