// ===== SONDEO DE RESERVAS =====
// In a serverless deployment there is no live socket (the deployed backend
// answers 404 on /socket.io), so the panel asks every few seconds whether a
// booking arrived. The socket, when it works, keeps doing its job: both paths
// mark the booking as known, so it is never announced twice.
//
// The panel only polls while the tab is visible: a hidden tab must not spend
// the operations of the free tier of Atlas.

import { useCallback, useEffect, useRef } from 'react';
import { getRecentBookingIds } from '../services/adminService.js';

export const POLL_INTERVAL_MS = 5000;

/**
 * @param {(ids: string[]) => void | Promise<void>} onNew called with the ids that arrived,
 *   newest first. It is never called with the bookings the panel already knew.
 * @param {number} [intervalMs] how often the panel asks.
 */
export function useBookingPolling(onNew, intervalMs = POLL_INTERVAL_MS) {
  const known = useRef(new Set());
  const handlerRef = useRef(onNew);

  useEffect(() => {
    handlerRef.current = onNew;
  });

  // The socket announces a booking too: mark it, so the poll does not repeat it.
  const markKnown = useCallback((ids) => {
    ids.forEach((id) => known.current.add(id));
  }, []);

  useEffect(() => {
    let busy = false;
    const tick = async () => {
      // A hidden tab does not poll; the panel catches up when it comes back.
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const ids = await getRecentBookingIds();
        const fresh = ids.filter((id) => !known.current.has(id));
        if (fresh.length > 0) {
          fresh.forEach((id) => known.current.add(id));
          await handlerRef.current(fresh);
        }
      } catch {
        // The panel keeps working without the poll: the next tick tries again.
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return { markKnown };
}
