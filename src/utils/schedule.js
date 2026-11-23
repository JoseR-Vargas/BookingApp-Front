// ===== HORARIOS DE ATENCIÓN =====
// The backend (GET /api/availability) owns the hours, the 30-minute grid and the start interval the
// admin chose: the booking UI renders the free start times it returns. This module only exists for the failure case, when that answer
// cannot be obtained and the UI would otherwise have nothing to offer. The hours themselves come
// from the catalog schedule (GET /api/catalog), never from hardcoded values.

const DEFAULT_INTERVAL_MINUTES = 30;

const WEEKDAY = { closed: false, open: '09:00', close: '20:00' };

// Hours assumed only until the page has received a catalog (never the case while the booking flow is
// on screen: it renders once the catalog is ready). Same values the backend seeds.
const SEEDED_SCHEDULE = {
  weekly: {
    0: { closed: true }, 1: WEEKDAY, 2: WEEKDAY, 3: WEEKDAY, 4: WEEKDAY, 5: WEEKDAY,
    6: { closed: false, open: '09:00', close: '18:00' },
  },
  slotIntervalMinutes: DEFAULT_INTERVAL_MINUTES,
};

let catalogSchedule = SEEDED_SCHEDULE;

/**
 * Registers the schedule of the loaded catalog (called by CatalogProvider) so the fallback grid follows
 * the hours the admin configured. `null` goes back to the seeded hours.
 */
export function setFallbackSchedule(schedule) {
  catalogSchedule = schedule || SEEDED_SCHEDULE;
}

const formatTime = (minutes) => (
  String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0')
);

const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/**
 * Start times of an open day: one every `intervalMinutes`, counted from `open` and before `close`
 * ('HH:mm' strings). The same rule the backend applies (`offeredStarts`), without bookings or service
 * duration: used by the admin preview and by the failure-only fallback below.
 */
export function offeredStartTimes(open, close, intervalMinutes = DEFAULT_INTERVAL_MINUTES) {
  const times = [];
  for (let minutes = toMinutes(open); minutes < toMinutes(close); minutes += intervalMinutes) {
    times.push(formatTime(minutes));
  }
  return times;
}

/**
 * Start times of one weekly entry: the day's own `starts` list when the admin set one (SPEC 06),
 * otherwise one every `intervalMinutes` from opening. Closed day -> [].
 */
export function dayStartTimes(day, intervalMinutes = DEFAULT_INTERVAL_MINUTES) {
  if (!day || day.closed) return [];
  if (Array.isArray(day.starts) && day.starts.length > 0) return day.starts;
  return offeredStartTimes(day.open, day.close, intervalMinutes);
}

/**
 * Failure-only fallback: every start time on the catalog's start interval (`startIntervalMinutes`,
 * 30 when the catalog does not report one), counted from the day's opening up to its closing time. It ignores bookings and service duration, so it is NOT a source of truth: the
 * backend still validates on create. Without a schedule for the day nothing is offered.
 *
 * @param {string} dateString 'YYYY-MM-DD'
 * @param {{weekly: Record<string, {closed: boolean, open?: string, close?: string}>, slotIntervalMinutes?: number, startIntervalMinutes?: number}|null} [schedule]
 *   a catalog schedule (keys follow Date.getDay(): 0 = Sunday, hours are 'HH:mm'); defaults to the one
 *   registered with `setFallbackSchedule`
 * @returns {{closed: boolean, times: string[]}}
 */
export function getFallbackSchedule(dateString, schedule = catalogSchedule) {
  // Local-date construction from 'YYYY-MM-DD' (never `new Date('YYYY-MM-DD')`, which is UTC).
  const [year, month, day] = dateString.split('-').map(Number);
  const dayOfWeek = new Date(year, month - 1, day).getDay();

  const daySchedule = schedule && schedule.weekly && schedule.weekly[dayOfWeek];
  if (!daySchedule || daySchedule.closed) return { closed: true, times: [] };

  const interval = schedule.startIntervalMinutes || schedule.slotIntervalMinutes || DEFAULT_INTERVAL_MINUTES;
  return { closed: false, times: dayStartTimes(daySchedule, interval) };
}
