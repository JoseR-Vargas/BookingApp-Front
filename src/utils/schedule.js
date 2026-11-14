// ===== HORARIOS DE ATENCIÓN =====
// The backend (GET /api/availability) owns the hours and the 30-minute grid: the booking UI renders
// the free start times it returns. This module only exists for the failure case, when that answer
// cannot be obtained and the UI would otherwise have nothing to offer.

import { APP_CONFIG } from '../config/appConfig.js';

const SATURDAY_CLOSING_HOUR = 18;

const formatTime = (minutes) => (
  String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0')
);

/**
 * Failure-only fallback: every start time on the configured interval (BUSINESS_HOURS.interval),
 * from opening up to the closing hour (Saturday closes at 18, Sunday is closed). It ignores
 * bookings and service duration, so it is NOT a source of truth: the backend still validates on create.
 *
 * @param {string} dateString 'YYYY-MM-DD'
 * @returns {{closed: boolean, times: string[]}}
 */
export function getFallbackSchedule(dateString) {
  // Local-date construction from 'YYYY-MM-DD' (never `new Date('YYYY-MM-DD')`, which is UTC).
  const [year, month, day] = dateString.split('-').map(Number);
  const dayOfWeek = new Date(year, month - 1, day).getDay();
  if (dayOfWeek === 0) return { closed: true, times: [] };

  const { start, end, interval } = APP_CONFIG.BUSINESS_HOURS;
  const closingHour = dayOfWeek === 6 ? SATURDAY_CLOSING_HOUR : end;
  const times = [];
  for (let minutes = start * 60; minutes < closingHour * 60; minutes += interval) {
    times.push(formatTime(minutes));
  }
  return { closed: false, times };
}
