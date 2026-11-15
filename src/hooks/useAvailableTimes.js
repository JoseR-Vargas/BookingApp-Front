// ===== HORARIOS DISPONIBLES =====
// Hook port of legacy `loadAvailableTimes` + `updateAvailableTimesForProfessional` (+ retry flow)
// from js/booking-app.js. It owns the availability fetch and returns what the time <select> renders.
//
// The backend (GET /api/availability) owns the 30-minute grid and answers with the free START times
// of every professional for the back-to-back block of the selected services. The hook shows exactly
// those times (a window that does not fit, closes or is occupied is simply absent).
//
// Availability belongs to each professional, not to the business: until one is selected there are no
// times, no count and no request. Once one is, a single request per date + services answers for
// everyone and the professional only filters the response client-side, so switching never refetches.
// Deliberate improvement over legacy, which left stale/unfiltered slots after a date change.
// Responses of superseded requests are ignored. If the lookup fails for good, a local grid stands in.

import { useEffect, useState } from 'react';
import { getAvailability } from '../services/bookingService.js';
import { toast } from '../ui/toast.js';
import { isMobileDevice, isSlowConnection } from '../utils/device.js';
import { getFallbackSchedule } from '../utils/schedule.js';

const MAX_RETRIES = 2;
const WARNING_DURATION = 10000;

const NO_DATE_TEXT = 'Selecciona una fecha primero';
const NO_PROFESSIONAL_TEXT = 'Selecciona un profesional primero';
const PICK_TIME_TEXT = 'Selecciona una hora';
const NO_TIMES_TEXT = 'No hay horarios disponibles';
const CLOSED_TEXT = 'Cerrado este día';

const loadingText = (mobile) => (mobile ? 'Cargando horarios...' : 'Verificando horarios disponibles');
const retryText = (mobile, attempt) => (mobile
  ? '📱 Reintentando conexión... (' + attempt + '/' + MAX_RETRIES + ')'
  : '🔄 Reintentando... (' + attempt + '/' + MAX_RETRIES + ')');
const retryDelay = (mobile) => (mobile ? 2500 : 1500);

const FALLBACK_MESSAGE = {
  mobile: 'No se pueden verificar las reservas. Se muestran todos los horarios. Te recomendamos llamar para confirmar.',
  desktop: 'No se pudieron verificar las reservas existentes. Se muestran todos los horarios disponibles. Te recomendamos confirmar por teléfono.',
};

// Legacy retry rule: timeouts, aborted requests and network failures are worth another try.
function isRetryable(error) {
  const message = String((error && error.message) || '');
  return (error && error.name === 'AbortError')
    || message.includes('Failed to fetch')
    || message.includes('Timeout');
}

// Free start times of the professional; a fallback grid is the same for everyone.
function pickTimes(result, professionalId) {
  if (result.fallbackTimes) return result.fallbackTimes;
  if (result.closed) return [];
  const professional = result.professionals.find((p) => p.id === professionalId);
  return professional ? professional.slots : [];
}

function describeTimes(result, professionalId) {
  const slots = pickTimes(result, professionalId);
  if (result.closed) return { placeholder: CLOSED_TEXT, slots, settled: true };
  const placeholder = slots.length > 0
    ? 'Selecciona una hora (' + slots.length + ' disponibles)'
    : NO_TIMES_TEXT;
  return { placeholder, slots, settled: true };
}

/**
 * @param {string|null} date  'YYYY-MM-DD' or null
 * @param {string|null} professionalId  whose free times to show; null shows none (and asks for no data)
 * @param {string[]} serviceIds  ids of the selected services (the booking window is their total duration)
 * @returns {{
 *   placeholder: string,  // text of the empty first <option>
 *   slots: string[],      // the selectable free start times, 'HH:MM'
 *   settled: boolean,     // true when `slots` is final (not loading / retrying)
 * }}
 */
export function useAvailableTimes(date, professionalId, serviceIds) {
  const [remote, setRemote] = useState(null);
  // A string key keeps the effect stable while callers pass a fresh array on every render.
  const servicesKey = serviceIds.join(',');
  const key = date && servicesKey ? [date, servicesKey].join('|') : null;
  // The request starts once a professional is selected; the key itself ignores which one.
  const requestKey = professionalId ? key : null;

  useEffect(() => {
    if (!requestKey) return undefined;

    let cancelled = false;
    let retryTimer = null;

    const load = async (attempt) => {
      const mobile = isMobileDevice();
      const timeout = (mobile || isSlowConnection()) ? 15000 : 10000;
      setRemote({ key, phase: 'loading', mobile, attempt, result: null });

      try {
        const availability = await getAvailability(date, servicesKey.split(','), { timeout });
        if (cancelled) return;
        setRemote({
          key,
          phase: 'ready',
          mobile,
          attempt,
          result: { closed: Boolean(availability.closed), professionals: availability.professionals },
        });
      } catch (error) {
        if (cancelled) return;

        if (attempt < MAX_RETRIES && isRetryable(error)) {
          setRemote({ key, phase: 'retrying', mobile, attempt: attempt + 1, result: null });
          retryTimer = setTimeout(() => load(attempt + 1), retryDelay(mobile));
          return;
        }

        // Failure-only fallback: the backend owns the grid, so without its answer all we can offer
        // is a local grid of start times (opening hours, no bookings, no duration check).
        // The backend still validates the slot on create.
        toast.warning(mobile ? FALLBACK_MESSAGE.mobile : FALLBACK_MESSAGE.desktop, WARNING_DURATION);
        const fallback = getFallbackSchedule(date);
        setRemote({
          key,
          phase: 'ready',
          mobile,
          attempt,
          result: { closed: fallback.closed, fallbackTimes: fallback.times },
        });
      }
    };

    load(0);

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, [requestKey, key, date, servicesKey]);

  if (!date) {
    return { placeholder: NO_DATE_TEXT, slots: [], settled: true };
  }

  if (!key) {
    // No service chosen yet: there is nothing to ask the backend about.
    return { placeholder: PICK_TIME_TEXT, slots: [], settled: true };
  }

  if (!professionalId) {
    return { placeholder: NO_PROFESSIONAL_TEXT, slots: [], settled: true };
  }

  // `remote` may still describe the previous date/services for one render: treat it as loading.
  const current = remote && remote.key === key ? remote : null;
  if (!current || current.phase === 'loading') {
    const mobile = current ? current.mobile : isMobileDevice();
    return { placeholder: loadingText(mobile), slots: [], settled: false };
  }
  if (current.phase === 'retrying') {
    return { placeholder: retryText(current.mobile, current.attempt), slots: [], settled: false };
  }

  return describeTimes(current.result, professionalId);
}
