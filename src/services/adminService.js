// ===== SERVICIO DE ADMINISTRACIÓN =====
// Lógica del panel admin — sin referencias al DOM.

import { apiClient } from '../core/apiClient.js';
import { authService, getAdminKey } from './authService.js';

// Booking admin calls: the backend does not protect them in this spec, so they carry no admin key.
export function getBookings() {
  return apiClient.get('/api/bookings');
}

export function getStatistics() {
  return apiClient.get('/api/bookings/statistics');
}

export function deleteBooking(id) {
  return apiClient.delete('/api/bookings/' + id);
}

// ----- Business configuration (every route requires the admin key) -----

// Single place where an expired/invalid admin key is handled: the session is cleared and the
// browser goes back to /login (hard navigation, so no stale panel state survives). The error is
// still rethrown so callers stop their own flow.
async function adminRequest(method, path, body) {
  const options = { headers: { Authorization: 'Bearer ' + (getAdminKey() || '') } };
  try {
    if (method === 'GET' || method === 'DELETE') {
      return await apiClient[method.toLowerCase()](path, options);
    }
    return await apiClient[method.toLowerCase()](path, body, options);
  } catch (error) {
    if (error && error.status === 401) {
      authService.logout();
      window.location.assign('/login');
    }
    throw error;
  }
}

export const getAdminCatalog = () => adminRequest('GET', '/api/admin/catalog');

export const createProfessional = (data) => adminRequest('POST', '/api/admin/professionals', data);
export const updateProfessional = (id, data) => adminRequest('PATCH', '/api/admin/professionals/' + id, data);
export const deleteProfessional = (id) => adminRequest('DELETE', '/api/admin/professionals/' + id);

export const createService = (data) => adminRequest('POST', '/api/admin/services', data);
export const updateService = (id, data) => adminRequest('PATCH', '/api/admin/services/' + id, data);
export const deleteService = (id) => adminRequest('DELETE', '/api/admin/services/' + id);

/** @param weekly {Record<0..6, {closed:true}|{closed:false,open:'HH:mm',close:'HH:mm'}>} all 7 days */
export const saveSchedule = (weekly) => adminRequest('PUT', '/api/admin/schedule', { weekly });
