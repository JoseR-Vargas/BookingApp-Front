// ===== PLANES =====
// What each plan offers, for the comparison table. The backend is the authority (it enforces the limits and
// owns the real values, `GET /api/admin/session` -> `plan.limits`); this is only what the page shows.

export const PLANS = [
  { id: 'gratis', name: 'Gratis', limits: { professionals: 1, locations: 1, bookingsPerMonth: 50, publicPage: false, reminders: false } },
  { id: 'pro', name: 'Pro', limits: { professionals: 3, locations: 2, bookingsPerMonth: 500, publicPage: true, reminders: true } },
  { id: 'negocio', name: 'Negocio', limits: { professionals: 10, locations: 5, bookingsPerMonth: 2000, publicPage: true, reminders: true } },
];

export const STATUS_LABELS = {
  trialing: 'En prueba',
  active: 'Activo',
  past_due: 'Pago pendiente',
  canceled: 'Cancelado',
};

export const planName = (id) => PLANS.find((plan) => plan.id === id)?.name || id;
