const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO date ('YYYY-MM-DD') of the first `dayOfWeek` (0 = Sunday) that is at least `minDaysAhead` days from now. */
export function nextWeekday(dayOfWeek, minDaysAhead = 7) {
  const date = new Date(Date.now() + minDaysAhead * DAY_MS);
  while (date.getUTCDay() !== dayOfWeek) date.setTime(date.getTime() + DAY_MS);
  return date.toISOString().slice(0, 10);
}

/** A Monday long gone: the backend accepts past dates, which is how the "cutoff closed" state is reached. */
export const PAST_MONDAY = '2020-01-06';

/** The long date the app renders ('martes, 7 de enero de 2025'), built like src/utils/format.js. */
export function longDateEs(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}
