// ===== SERVICIO DE RESERVAS =====
// Lógica de negocio pura — sin referencias al DOM.

import { apiClient } from '../core/apiClient.js';
import { availabilityCheckSchema, availabilitySchema } from '../schemas/api/availability.schema.js';
import { createdBookingSchema } from '../schemas/api/booking.schema.js';
import { parseResponse } from '../schemas/parse-response.js';
import { sanitizeInput } from '../utils/sanitize.js';
import { getServiceIds } from '../utils/serviceSelection.js';

export async function createBooking(bookingData) {
  return parseResponse(createdBookingSchema, await apiClient.post('/api/bookings', bookingData, { timeout: 30000 }));
}

// Free start times per professional (offering ALL the services) for the back-to-back block of the services.
// `options.locationId` (SPEC 08) picks the location; left out, the backend uses the default one.
export async function getAvailability(date, serviceIds, options) {
  const { locationId, ...requestOptions } = options || {};
  let query = `date=${encodeURIComponent(date)}&serviceIds=${serviceIds.map(encodeURIComponent).join(',')}`;
  if (locationId) query += `&locationId=${encodeURIComponent(locationId)}`;
  return parseResponse(availabilitySchema, await apiClient.get(`/api/availability?${query}`, requestOptions));
}

// Last-second check that the WHOLE window (sum of the service durations) is still free.
export async function checkAvailability(date, time, professionalId, serviceIds, locationId) {
  const body = { date, time, professionalId, serviceIds };
  if (locationId) body.locationId = locationId;
  const { available } = parseResponse(availabilityCheckSchema, await apiClient.post('/api/bookings/availability', body));
  return available;
}

// Builds the wire shape of POST /api/bookings.
// User-provided text is escaped here (same escaping as legacy getFormData) for data compatibility.
export function buildBookingPayload({ formData, services, professional, date, time, location }) {
  const payload = {
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
  // SPEC 08: only a business with several locations picks one; the backend uses the default otherwise.
  if (location) payload.location = { id: location.id };
  return payload;
}
