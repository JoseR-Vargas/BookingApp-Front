// ===== SERVICIO DE DISPONIBILIDAD PÚBLICA =====
// General availability behind /disponibilidad (SPEC 07): per day, the free start times of the next
// days with the professionals free at each one. Public (no admin key). The backend owns the rules.

import { apiClient } from '../core/apiClient.js';

/**
 * @param serviceId {string} [serviceId] left out: the backend uses the first published service
 * @param locationId {string} [locationId] SPEC 08, left out: the default location. The answer then also carries
 *   `locations: {id, name}[]` and `locationId`
 * @returns {Promise<{enabled: false}|{enabled: true, services: {id: string, name: string, duration: number}[],
 *   serviceId: string|null, days: {date: string, closed: boolean, times: {time: string, professionals: {id: string, name: string}[]}[]}[]}>}
 */
export function getPublicAvailability(serviceId, locationId, options) {
  const params = [];
  if (serviceId) params.push(`serviceId=${encodeURIComponent(serviceId)}`);
  if (locationId) params.push(`locationId=${encodeURIComponent(locationId)}`);
  return apiClient.get(`/api/public-availability${params.length > 0 ? `?${params.join('&')}` : ''}`, options || {});
}
