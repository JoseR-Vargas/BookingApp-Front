// ===== SERVICIO DE DISPONIBILIDAD PÚBLICA =====
// General availability behind /disponibilidad (SPEC 07): per day, the free start times of the next
// days with the professionals free at each one. Public (no admin key). The backend owns the rules.

import { apiClient } from '../core/apiClient.js';

/**
 * @param serviceId {string} [serviceId] left out: the backend uses the first published service
 * @returns {Promise<{enabled: false}|{enabled: true, services: {id: string, name: string, duration: number}[],
 *   serviceId: string|null, days: {date: string, closed: boolean, times: {time: string, professionals: {id: string, name: string}[]}[]}[]}>}
 */
export function getPublicAvailability(serviceId, options) {
  const query = serviceId ? `?serviceId=${encodeURIComponent(serviceId)}` : '';
  return apiClient.get(`/api/public-availability${query}`, options || {});
}
