import { formatMoney } from '../../utils/format.js';
import { getTotalDuration, getTotalPrice } from '../../utils/serviceSelection.js';

const countLabel = (count) => `${count} ${count === 1 ? 'servicio' : 'servicios'}`;

/**
 * Compact bar at the bottom of step 1: "N servicios · $total · X min".
 * Renders nothing until a service is selected; sticks to the bottom of the scrolling modal body.
 */
export default function ServiceSelectionSummary({ services }) {
  if (services.length === 0) return null;

  return (
    <div
      role="status"
      data-testid="service-selection-summary"
      className="sticky bottom-0 mt-3 flex items-center justify-center gap-2 rounded-lg border border-accent bg-bg-tertiary px-3 py-2 text-[0.95rem] font-semibold text-text-primary shadow-md cq-compact:text-[0.85rem]"
    >
      <span>
        {countLabel(services.length)} · {formatMoney(getTotalPrice(services))} · {getTotalDuration(services)} min
      </span>
    </div>
  );
}
