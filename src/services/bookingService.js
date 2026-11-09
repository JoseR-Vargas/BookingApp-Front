// ===== SERVICIO DE RESERVAS =====
// Lógica de negocio pura — sin referencias al DOM.

import { apiClient } from '../core/apiClient.js';
import { sanitizeInput } from '../utils/sanitize.js';
import { getServiceIds } from '../utils/serviceSelection.js';

export function createBooking(bookingData) {
  return apiClient.post('/api/bookings', bookingData, { timeout: 30000 });
}

// Free start times per professional (offering ALL the services) for the back-to-back block of the services.
export function getAvailability(date, serviceIds, options) {
  const query = `date=${encodeURIComponent(date)}&serviceIds=${serviceIds.map(encodeURIComponent).join(',')}`;
  return apiClient.get(`/api/availability?${query}`, options || {});
}

// Last-second check that the WHOLE window (sum of the service durations) is still free.
export async function checkAvailability(date, time, professionalId, serviceIds) {
  const { available } = await apiClient.post('/api/bookings/availability', { date, time, professionalId, serviceIds });
  return available;
}

// Builds the wire shape of POST /api/bookings.
// User-provided text is escaped here (same escaping as legacy getFormData) for data compatibility.
export function buildBookingPayload({ formData, services, professional, date, time }) {
  return {
    client: {
      name: sanitizeInput(formData.name),
      id: sanitizeInput(formData.id || ''),
      email: sanitizeInput(formData.email),
      phone: sanitizeInput(formData.phone),
    },
    // Only ids travel: the backend takes name, price and duration from its catalog.
    services: getServiceIds(services).map((id) => ({ id })),
    professional: {
      id: professional.id,
      name: professional.name,
    },
    date,
    time,
    notes: sanitizeInput(formData.notes),
    status: 'confirmed',
  };
}
