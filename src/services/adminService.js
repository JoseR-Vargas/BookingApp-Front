// ===== SERVICIO DE ADMINISTRACIÓN =====
// Lógica del panel admin — sin referencias al DOM.

import { currentTenantSlug } from '../tenancy/tenant-resolver.js';
import { tenantPath } from '../tenancy/tenant-link.js';
import { apiClient } from '../core/apiClient.js';
import { adminCatalogSchema } from '../schemas/api/catalog.schema.js';
import { bookingListSchema, statisticsSchema } from '../schemas/api/booking.schema.js';
import { parseResponse } from '../schemas/parse-response.js';
import { authService, getAdminKey, getAdminUser } from './authService.js';

// Every admin route requires the admin key (`Authorization: Bearer <ADMIN_API_KEY>`). This is the
// single place where an expired/invalid key is handled: the session is cleared and the
// browser goes back to /login (hard navigation, so no stale panel state survives). The error is
// still rethrown so callers stop their own flow.
async function adminRequest(method, path, body) {
  // An account session travels in its cookie; the shared key goes as a Bearer token.
  const headers = {};
  const adminKey = getAdminKey();
  if (adminKey) headers.Authorization = 'Bearer ' + adminKey;
  // The backend requires the username too when it has ADMIN_USERNAME configured.
  const user = getAdminUser();
  if (user) headers['X-Admin-Username'] = user;
  const options = { headers };
  try {
    if (method === 'GET' || method === 'DELETE') {
      return await apiClient[method.toLowerCase()](path, options);
    }
    return await apiClient[method.toLowerCase()](path, body, options);
  } catch (error) {
    if (error && error.status === 401) {
      authService.logout();
      window.location.assign(tenantPath(currentTenantSlug(), '/login') + '?expired=1');
    }
    throw error;
  }
}

// ----- Bookings (the backend protects them with the admin key) -----
// The public booking calls (create, availability, cancel by link) live in bookingService and
// cancellationService and never carry the key.

export const getBookings = async () => parseResponse(bookingListSchema, await adminRequest('GET', '/api/bookings'));

export const getStatistics = async () => parseResponse(statisticsSchema, await adminRequest('GET', '/api/bookings/statistics'));

// Erases the booking and its history. Use cancelBooking to just free the slot.
export const deleteBooking = (id) => adminRequest('DELETE', '/api/bookings/' + id);

// Frees the slot and keeps the booking in the history, with no time restriction (the one-minute
// cutoff only applies to the client's cancel link).
export const cancelBooking = (id) => adminRequest('PATCH', '/api/bookings/' + id, { status: 'cancelled' });

// ----- Business configuration -----

export const getAdminCatalog = async () => parseResponse(adminCatalogSchema, await adminRequest('GET', '/api/admin/catalog'));

export const createProfessional = (data) => adminRequest('POST', '/api/admin/professionals', data);
export const updateProfessional = (id, data) => adminRequest('PATCH', '/api/admin/professionals/' + id, data);

// Profile photo (SPEC 04). `createProfessional` also takes an optional `photoDataUrl` so the
// professional and the photo are saved in one request. Both data URLs come from resizeToSquareJpeg.
/** @param dataUrl {string} 'data:image/jpeg;base64,...' (PNG, JPEG or WebP, up to 200 KB) */
export const uploadProfessionalPhoto = (id, dataUrl) =>
  adminRequest('PUT', '/api/admin/professionals/' + id + '/photo', { dataUrl });
export const deleteProfessionalPhoto = (id) => adminRequest('DELETE', '/api/admin/professionals/' + id + '/photo');
// Soft delete: the professional stays in the database, inactive ("Desactivar").
export const deleteProfessional = (id) => adminRequest('DELETE', '/api/admin/professionals/' + id);
// Permanent delete ("Eliminar"). The backend answers 409 with a readable message while the
// professional still has future confirmed bookings or is the only one offering a service.
export const deleteProfessionalPermanently = (id) =>
  adminRequest('DELETE', '/api/admin/professionals/' + id + '/permanent');

export const createService = (data) => adminRequest('POST', '/api/admin/services', data);
export const updateService = (id, data) => adminRequest('PATCH', '/api/admin/services/' + id, data);
// Soft delete: the service stays in the database, inactive ("Desactivar").
export const deleteService = (id) => adminRequest('DELETE', '/api/admin/services/' + id);
// Permanent delete ("Eliminar"). The backend answers 409 with a readable message while the
// service still has future confirmed bookings.
export const deleteServicePermanently = (id) =>
  adminRequest('DELETE', '/api/admin/services/' + id + '/permanent');

/** @param weekly {Record<0..6, {closed:true}|{closed:false,open:'HH:mm',close:'HH:mm'}>} all 7 days */
// `startIntervalMinutes` (SPEC 05) is optional: left out, the backend keeps the stored value.
export const saveSchedule = (weekly, startIntervalMinutes) => adminRequest(
  'PUT',
  '/api/admin/schedule',
  startIntervalMinutes === undefined ? { weekly } : { weekly, startIntervalMinutes },
);

// ----- Brand (SPEC 03): colors, business name and logo -----

/** @param branding {{ businessName: string|null, colors: {accent, background, text, button} }} */
export const saveBranding = (branding) => adminRequest('PUT', '/api/admin/branding', branding);
/** @param dataUrl {string} 'data:image/png;base64,...' (PNG, JPEG or WebP, up to 200 KB) */
export const uploadLogo = (dataUrl) => adminRequest('PUT', '/api/admin/branding/logo', { dataUrl });
export const deleteLogo = () => adminRequest('DELETE', '/api/admin/branding/logo');

/**
 * Settings of the public availability page (SPEC 07).
 * @param settings {{enabled: boolean, days: number, serviceIds: string[]|null}} `null` = every active service
 */
export const savePublicAvailability = (settings) => adminRequest('PUT', '/api/admin/public-availability', settings);

// ----- Locations (SPEC 08) -----

/** @param data {{name: string, address: string}} */
export const createLocation = (data) => adminRequest('POST', '/api/admin/locations', data);
/** @param data {{name: string, address: string, active: boolean}} */
export const updateLocation = (id, data) => adminRequest('PUT', '/api/admin/locations/' + id, data);
/** Same body as `saveSchedule`, for one location. `startIntervalMinutes` left out keeps the stored value. */
export const saveLocationSchedule = (id, weekly, startIntervalMinutes) => adminRequest(
  'PUT',
  '/api/admin/locations/' + id + '/schedule',
  startIntervalMinutes === undefined ? { weekly } : { weekly, startIntervalMinutes },
);

// ----- Accounts of the business (owner only, spec 20) -----
export const listUsers = () => adminRequest('GET', '/api/admin/users');
export const createUser = (data) => adminRequest('POST', '/api/admin/users', data);
export const changeUserRole = (id, role) => adminRequest('PATCH', '/api/admin/users/' + id + '/role', { role });
export const deactivateUser = (id) => adminRequest('POST', '/api/admin/users/' + id + '/deactivate');
export const rotateUserPassword = (id, password) => adminRequest('PUT', '/api/admin/users/' + id + '/password', { password });

