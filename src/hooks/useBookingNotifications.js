// ===== NOTIFICACIONES DE RESERVAS EN TIEMPO REAL =====
// Owns the live side of the admin panel: socket connection, unread counter, notification sound and
// the "enable sound" state. Port of legacy notification-service + the audio wiring of admin-app.js.

import { useCallback, useEffect, useRef, useState } from 'react';
import { APP_CONFIG } from '../config/appConfig.js';
import { audioService } from '../services/audioService.js';
import { connectBookingSocket } from '../services/realtimeService.js';
import { toast } from '../ui/toast.js';

const SOUND_DELAY_MS = 100;

/**
 * @param {(booking: object) => void | Promise<void>} onNewBooking called after the counter and the
 *   sound were handled; always the latest callback, so changing it never reconnects the socket.
 * @param {(payload: {id: string, status: string}) => void | Promise<void>} [onBookingCancelled] a
 *   client cancelled from their link. No counter and no sound: it is not a new booking.
 */
export function useBookingNotifications(onNewBooking, onBookingCancelled) {
  const [count, setCount] = useState(0);
  const [needsSoundActivation, setNeedsSoundActivation] = useState(false);
  const handlerRef = useRef(onNewBooking);
  const cancelledRef = useRef(onBookingCancelled);
  const announceRef = useRef(() => undefined);
  // The timers of the sounds that were scheduled, so a remount does not leave one pending.
  const timersRef = useRef(new Set());

  /**
   * A booking arrived: the counter and the sound, then the handler of the panel.
   * The socket and the poll (there is no live socket in a serverless deployment)
   * both come through here, so a booking is never announced twice.
   */
  const announce = useCallback((payload) => {
    setCount((current) => current + 1);
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      audioService.playNotification();
    }, SOUND_DELAY_MS);
    timersRef.current.add(timer);
    return handlerRef.current && handlerRef.current(payload);
  }, []);

  useEffect(() => {
    handlerRef.current = onNewBooking;
    cancelledRef.current = onBookingCancelled;
  });

  useEffect(() => {
    announceRef.current = announce;
  }, [announce]);

  useEffect(() => {
    // Subscribe BEFORE init(): init() may emit 'needs-activation' synchronously.
    const unsubscribe = audioService.subscribe((event) => {
      if (event === 'needs-activation') setNeedsSoundActivation(true);
      else if (event === 'activated') setNeedsSoundActivation(false);
    });
    audioService.init();

    // Browsers block audio until a gesture: the first click anywhere unlocks it (once).
    const activateOnInteraction = () => audioService.activate();
    document.addEventListener('click', activateOnInteraction, { once: true });

    const connection = connectBookingSocket(APP_CONFIG.BACKEND_URL, {
      onNewBooking: (booking) => announceRef.current(booking),
      onBookingCancelled: (payload) => cancelledRef.current && cancelledRef.current(payload),
    });

    // StrictMode mounts, unmounts and mounts again: tear everything down so only one socket stays live.
    return () => {
      unsubscribe();
      document.removeEventListener('click', activateOnInteraction);
      timersRef.current.forEach(clearTimeout);
      timersRef.current.clear();
      connection.disconnect();
    };
  }, []);

  const clearCount = useCallback(() => setCount(0), []);

  const activateSound = useCallback(() => {
    audioService.activate();
    toast.success('Sonido de notificaciones activado');
  }, []);

  return { count, clearCount, needsSoundActivation, activateSound, announce };
}
