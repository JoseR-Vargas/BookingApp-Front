// ===== SERVICIO DE ADMINISTRACIÓN =====
// Lógica del panel admin — sin referencias al DOM.

import { apiClient } from '../core/apiClient.js';
import { authService, getAdminKey } from './authService.js';

// Every admin route requires the admin key (`Authorization: Bearer <ADMIN_API_KEY>`). This is the
// single place where an expired/invalid key is handled: the session is cleared and the
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

// ----- Bookings (the backend protects them with the admin key) -----
// The public booking calls (create, availability, cancel by link) live in bookingService and
// cancellationService and never carry the key.

export const getBookings = () => adminRequest('GET', '/api/bookings');

export const getStatistics = () => adminRequest('GET', '/api/bookings/statistics');

// Erases the booking and its history. Use cancelBooking to just free the slot.
export const deleteBooking = (id) => adminRequest('DELETE', '/api/bookings/' + id);

// Frees the slot and keeps the booking in the history, with no time restriction (the one-minute
// cutoff only applies to the client's cancel link).
export const cancelBooking = (id) => adminRequest('PATCH', '/api/bookings/' + id, { status: 'cancelled' });

// ----- Business configuration -----

export const getAdminCatalog = () => adminRequest('GET', '/api/admin/catalog');

export const createProfessional = (data) => adminRequest('POST', '/api/admin/professionals', data);
export const updateProfessional = (id, data) => adminRequest('PATCH', '/api/admin/professionals/' + id, data);
export const deleteProfessional = (id) => adminRequest('DELETE', '/api/admin/professionals/' + id);

export const createService = (data) => adminRequest('POST', '/api/admin/services', data);
export const updateService = (id, data) => adminRequest('PATCH', '/api/admin/services/' + id, data);
export const deleteService = (id) => adminRequest('DELETE', '/api/admin/services/' + id);

/** @param weekly {Record<0..6, {closed:true}|{closed:false,open:'HH:mm',close:'HH:mm'}>} all 7 days */
export const saveSchedule = (weekly) => adminRequest('PUT', '/api/admin/schedule', { weekly });

// ----- Brand (SPEC 03): colors, business name and logo -----

/** @param branding {{ businessName: string|null, colors: {accent, background, text, accentSecondary} }} */
export const saveBranding = (branding) => adminRequest('PUT', '/api/admin/branding', branding);
/** @param dataUrl {string} 'data:image/png;base64,...' (PNG, JPEG or WebP, up to 200 KB) */
export const uploadLogo = (dataUrl) => adminRequest('PUT', '/api/admin/branding/logo', { dataUrl });
export const deleteLogo = () => adminRequest('DELETE', '/api/admin/branding/logo');
