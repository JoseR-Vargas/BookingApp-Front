const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO date ('YYYY-MM-DD') of the first `dayOfWeek` (0 = Sunday) that is at least `minDaysAhead` days from now. */
export function nextWeekday(dayOfWeek, minDaysAhead = 7) {
  const date = new Date(Date.now() + minDaysAhead * DAY_MS);
  while (date.getUTCDay() !== dayOfWeek) date.setTime(date.getTime() + DAY_MS);
  return date.toISOString().slice(0, 10);
}
