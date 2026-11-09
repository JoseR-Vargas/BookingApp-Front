// ===== HORARIOS DE ATENCIÓN =====
// Pure replacement for the DOM-built <option> lists in legacy booking-app.js
// (loadAvailableTimes / renderTimeSlots / updateAvailableTimesForProfessional).

import { APP_CONFIG } from '../config/appConfig.js';

const SATURDAY_CLOSING_HOUR = 18;
const CLOSED_LABEL = 'Domingo cerrado';

// Local-date construction from 'YYYY-MM-DD', exactly as legacy (never `new Date('YYYY-MM-DD')`, which is UTC).
function parseLocalDate(dateString) {
  const parts = dateString.split('-');
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

export function getDayInfo(dateString) {
  const dayOfWeek = parseLocalDate(dateString).getDay();
  if (dayOfWeek === 0) {
    return { closed: true, closedLabel: CLOSED_LABEL };
  }
  const closingHour = dayOfWeek === 6 ? SATURDAY_CLOSING_HOUR : APP_CONFIG.BUSINESS_HOURS.end;
  return { closed: false, closingHour };
}

// bookedTimes: array of 'HH:00' strings; `null` means "bookings not known yet"
// (legacy loadAvailableTimes) => all slots free and the plain header text.
export function buildTimeSlots(dateString, bookedTimes = []) {
  const day = getDayInfo(dateString);
  if (day.closed) {
    return {
      closed: true,
      closedLabel: day.closedLabel,
      slots: [],
      availableCount: 0,
      headerText: day.closedLabel,
    };
  }

  const { start, lunchBreak } = APP_CONFIG.BUSINESS_HOURS;
  const bookedList = bookedTimes || [];
  const slots = [];
  for (let hour = start; hour < day.closingHour; hour++) {
    if (hour >= lunchBreak.start && hour < lunchBreak.end) continue;
    const value = hour.toString().padStart(2, '0') + ':00';
    slots.push({ value, booked: bookedList.includes(value) });
  }

  const availableCount = slots.filter((s) => !s.booked).length;
  let headerText;
  if (bookedTimes === null) {
    headerText = 'Selecciona una hora';
  } else {
    headerText = availableCount > 0
      ? 'Selecciona una hora (' + availableCount + ' disponibles)'
      : 'No hay horarios disponibles';
  }

  return { closed: false, slots, availableCount, headerText };
}

// Grid times a professional cannot start at, given the start times the backend reports as free
// (a window that does not fit - closing, lunch, occupied - is simply absent from `freeTimes`).
export function getUnavailableTimes(dateString, freeTimes) {
  return buildTimeSlots(dateString).slots
    .map((slot) => slot.value)
    .filter((value) => !freeTimes.includes(value));
}
