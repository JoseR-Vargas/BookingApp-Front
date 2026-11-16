// ===== CANCELACIÓN POR ENLACE =====
// The two public endpoints behind /cancelar/:token. The secret token in the URL is the only
// credential: these calls never carry the admin key. The one-minute cutoff is judged by the
// backend (business timezone, server clock); nothing here decides whether a booking is cancellable.

import { apiClient } from '../core/apiClient.js';

// The token comes from the address bar: encode it so it can never change the route it is appended to.
const cancelPath = (token) => '/api/bookings/cancel/' + encodeURIComponent(token);

/** @returns {Promise<{state: 'cancellable'|'closed'|'cancelled', services: {name: string}[], professional: {name: string}, date: string, time: string}>} */
export function getCancellation(token) {
  return apiClient.get(cancelPath(token));
}

/** Idempotent on the backend: cancelling an already cancelled booking answers its summary. */
export function cancelByToken(token) {
  return apiClient.post(cancelPath(token), null);
}
