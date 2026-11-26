// ===== SERVICIO DE PLATAFORMA =====
// The owner of the system (not a business) sees the aggregated signals of every business with a
// separate key (`x-platform-key`). It never reads the data of a client.

import { apiClient } from '../core/apiClient.js';

const KEY_NAME = 'platformKey';

/** The platform key of this browser session, if the owner typed it. */
export function getPlatformKey() {
  return sessionStorage.getItem(KEY_NAME) || '';
}

export function setPlatformKey(value) {
  if (value) sessionStorage.setItem(KEY_NAME, value);
  else sessionStorage.removeItem(KEY_NAME);
}

export function hasPlatformKey() {
  return Boolean(getPlatformKey());
}

/** Every platform route travels with the platform key. */
async function platformRequest(method, path, body) {
  const key = getPlatformKey();
  if (!key) {
    const error = new Error('Falta la clave de plataforma.');
    error.status = 401;
    throw error;
  }
  const options = { headers: { 'x-platform-key': key } };
  // GET takes only the options; the rest take the body and the options.
  if (method === 'GET') return apiClient.get(path, options);
  return apiClient[method.toLowerCase()](path, body, options);
}

const json = async (promise) => {
  const raw = await promise;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
};

export const listBusinesses = () => json(platformRequest('GET', '/api/platform/tenants'));
export const getBusiness = (id) => json(platformRequest('GET', `/api/platform/tenants/${id}`));
export const getPlatformMetrics = () => json(platformRequest('GET', '/api/platform/metrics'));
export const suspendBusiness = (id) => json(platformRequest('POST', `/api/platform/tenants/${id}/suspend`));
export const reactivateBusiness = (id) => json(platformRequest('POST', `/api/platform/tenants/${id}/reactivate`));
export const extendTrial = (id, days) => json(platformRequest('POST', `/api/platform/tenants/${id}/trial`, { days }));
export const changePlan = (id, planId) => json(platformRequest('POST', `/api/platform/tenants/${id}/plan`, { planId }));
