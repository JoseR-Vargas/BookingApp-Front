// ===== SERVICIO DE AUTENTICACIÓN =====
// The admin "password" is the backend ADMIN_API_KEY: login validates it against GET /api/admin/session
// and, when accepted, keeps it in sessionStorage so adminService can send it as a Bearer token.
// The username travels in X-Admin-Username: the backend only checks it when it has ADMIN_USERNAME
// configured (then it is required on every admin request, together with the key). Brute-force lockout
// is kept on the client.

import { apiClient } from '../core/apiClient.js';
import { sessionSchema } from '../schemas/api/session.schema.js';
import { parseResponse } from '../schemas/parse-response.js';
import { currentTenantSlug } from '../tenancy/tenant-resolver.js';
import { sessionKey } from '../tenancy/tenant-storage.js';

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 60000; // 1 minuto en ms

const KEYS = ['isAdmin', 'adminUser', 'adminKey', 'adminRole', 'adminMode'];

let attempts = 0;
let lockoutUntil = null;

// The admin session is per business (spec 19): the default one keeps the legacy keys.
const key = (name) => sessionKey(name, currentTenantSlug());

export function getAdminKey() {
  return sessionStorage.getItem(key('adminKey'));
}

export function getAdminUser() {
  return sessionStorage.getItem(key('adminUser'));
}

export const authService = {
  async login(username, password) {
    if (!username || !password) {
      throw new Error('Por favor completa todos los campos');
    }

    if (lockoutUntil && Date.now() < lockoutUntil) {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      throw new Error('Demasiados intentos fallidos. Intenta de nuevo en ' + remaining + ' segundos.');
    }

    // An account (email + password) opens a cookie session; anything else is the shared admin key, which
    // keeps working while a business has no accounts (spec 20, transition).
    if (username.includes('@')) {
      try {
        const opened = await apiClient.post('/api/admin/session', { email: username, password });
        const user = opened && opened.user;
        if (user && user.role) {
          attempts = 0;
          lockoutUntil = null;
          sessionStorage.setItem(key('isAdmin'), 'true');
          sessionStorage.setItem(key('adminUser'), user.name || user.email);
          sessionStorage.setItem(key('adminRole'), user.role);
          sessionStorage.setItem(key('adminMode'), 'session');
          return { username: user.name || user.email };
        }
      } catch (error) {
        if (!error || error.status !== 401) {
          throw new Error('No se pudo conectar con el servidor. Intenta de nuevo en unos minutos.');
        }
      }
    }

    try {
      parseResponse(sessionSchema, await apiClient.get('/api/admin/session', {
        headers: { Authorization: 'Bearer ' + password, 'X-Admin-Username': username },
      }));
    } catch (error) {
      // Only a 401 means "wrong key". Anything else (network down, timeout, 5xx) says nothing about
      // the key, so it does not count towards the lockout.
      if (!error || error.status !== 401) {
        throw new Error('No se pudo conectar con el servidor. Intenta de nuevo en unos minutos.');
      }
      attempts++;
      if (attempts >= MAX_ATTEMPTS) {
        lockoutUntil = Date.now() + LOCKOUT_DURATION;
        attempts = 0;
        throw new Error('Cuenta bloqueada por demasiados intentos. Intenta en 60 segundos.');
      }
      const remaining = MAX_ATTEMPTS - attempts;
      throw new Error('Usuario o contraseña incorrectos. Intentos restantes: ' + remaining);
    }

    attempts = 0;
    lockoutUntil = null;
    sessionStorage.setItem(key('isAdmin'), 'true');
    sessionStorage.setItem(key('adminUser'), username);
    sessionStorage.setItem(key('adminKey'), password);
    sessionStorage.setItem(key('adminRole'), 'owner');
    sessionStorage.setItem(key('adminMode'), 'key');
    return { username };
  },

  logout() {
    // The cookie is HttpOnly: only the backend can clear it. Best effort, the local state goes either way.
    if (sessionStorage.getItem(key('adminMode')) === 'session') {
      apiClient.delete('/api/admin/session').catch(() => {});
    }
    KEYS.forEach((name) => sessionStorage.removeItem(key(name)));
  },

  isAuthenticated() {
    return sessionStorage.getItem(key('isAdmin')) === 'true';
  },

  getUser() {
    return sessionStorage.getItem(key('adminUser'));
  },

  /** `owner`, `staff` or `viewer`. The shared key counts as owner. */
  getRole() {
    return sessionStorage.getItem(key('adminRole')) || 'owner';
  },

  getAdminKey,
  getAdminUser,

  // Test-only: clears the in-memory brute-force counters.
  _reset() {
    attempts = 0;
    lockoutUntil = null;
  },
};
