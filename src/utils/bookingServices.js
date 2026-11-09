// ===== SERVICES OF A BOOKING =====
// Single place that knows how a stored booking exposes its service lines and totals:
// `{ services: [{ id, name, price, duration }], totalPrice, totalDuration }`.

export function getBookingServices(booking) {
  return (booking && booking.services) || [];
}

// Names of the service lines, in booking order.
export function getServiceNames(booking) {
  return getBookingServices(booking).map((service) => service.name).filter(Boolean);
}

export function getBookingTotalPrice(booking) {
  return (booking && booking.totalPrice) || 0;
}

export function getBookingTotalDuration(booking) {
  return (booking && booking.totalDuration) || 0;
}
