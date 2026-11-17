// ===== SERVICIO DE AUTENTICACIÓN =====
// The admin "password" is the backend ADMIN_API_KEY: login validates it against GET /api/admin/session
// and, when accepted, keeps it in sessionStorage so adminService can send it as a Bearer token.
// The username travels in X-Admin-Username: the backend only checks it when it has ADMIN_USERNAME
// configured (then it is required on every admin request, together with the key). Brute-force lockout
// is kept on the client.

import { apiClient } from '../core/apiClient.js';

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 60000; // 1 minuto en ms

const KEYS = ['isAdmin', 'adminUser', 'adminKey'];

let attempts = 0;
let lockoutUntil = null;

export function getAdminKey() {
  return sessionStorage.getItem('adminKey');
}

export function getAdminUser() {
  return sessionStorage.getItem('adminUser');
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

    try {
      await apiClient.get('/api/admin/session', {
        headers: { Authorization: 'Bearer ' + password, 'X-Admin-Username': username },
      });
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
    sessionStorage.setItem('isAdmin', 'true');
    sessionStorage.setItem('adminUser', username);
    sessionStorage.setItem('adminKey', password);
    return { username };
  },

  logout() {
    KEYS.forEach((key) => sessionStorage.removeItem(key));
  },

  isAuthenticated() {
    return sessionStorage.getItem('isAdmin') === 'true';
  },

  getUser() {
    return sessionStorage.getItem('adminUser');
  },

  getAdminKey,
  getAdminUser,

  // Test-only: clears the in-memory brute-force counters.
  _reset() {
    attempts = 0;
    lockoutUntil = null;
  },
};
