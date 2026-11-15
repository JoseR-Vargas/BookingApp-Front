// Weekly schedule the backend seeds (BookingApp_Back/src/catalog/catalog.config.ts), keyed by Date.getDay().
// The suite writes this back before and after it runs so reruns start from the same global configuration.
const WEEKDAY = { closed: false, open: '09:00', close: '20:00' };

export const SEED_WEEKLY = {
  0: { closed: true },
  1: WEEKDAY,
  2: WEEKDAY,
  3: WEEKDAY,
  4: WEEKDAY,
  5: WEEKDAY,
  6: { closed: false, open: '09:00', close: '18:00' },
};
