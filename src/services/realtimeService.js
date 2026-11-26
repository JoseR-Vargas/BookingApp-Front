// ===== SERVICIO DE TIEMPO REAL =====
// Socket.IO connection for live booking notifications (socket half of legacy notification-service).
// The counter/badge/sound live in the React layer; this module only owns the connection.
// 'newBooking' and 'bookingCancelled' are backend contracts — do not rename. The latter carries
// only `{ id, status }`: it tells the panel to refresh, never client data.

import { io } from 'socket.io-client';
import { getAdminKey, getAdminUser } from './authService.js';
import { currentTenantSlug } from '../tenancy/tenant-resolver.js';

export function connectBookingSocket(backendUrl, { onNewBooking, onBookingCancelled, onError } = {}) {
  try {
    // The backend only lets admins in (spec 18): the credentials travel in the handshake and are
    // read again on every reconnection. The business is the one of the route.
    const socket = io(backendUrl, {
      withCredentials: true,
      auth: (cb) => cb({ key: getAdminKey() || '', username: getAdminUser() || '', tenant: currentTenantSlug() || '' }),
    });

    socket.on('newBooking', (booking) => {
      if (onNewBooking) return onNewBooking(booking);
    });

    socket.on('bookingCancelled', (payload) => {
      if (onBookingCancelled) return onBookingCancelled(payload);
    });

    socket.on('connect_error', (error) => {
      console.error('Error de conexión WebSocket:', error);
      if (onError) onError(error);
    });

    return { disconnect: () => socket.disconnect() };
  } catch (error) {
    console.error('Error inicializando WebSocket:', error);
    return { disconnect: () => {} };
  }
}
