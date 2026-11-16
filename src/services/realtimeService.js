// ===== SERVICIO DE TIEMPO REAL =====
// Socket.IO connection for live booking notifications (socket half of legacy notification-service).
// The counter/badge/sound live in the React layer; this module only owns the connection.
// 'newBooking' and 'bookingCancelled' are backend contracts — do not rename. The latter carries
// only `{ id, status }`: it tells the panel to refresh, never client data.

import { io } from 'socket.io-client';

export function connectBookingSocket(backendUrl, { onNewBooking, onBookingCancelled, onError } = {}) {
  try {
    const socket = io(backendUrl);

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
