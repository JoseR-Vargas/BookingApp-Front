import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { APP_CONFIG } from '../config/appConfig.js';
import { authService, getAdminKey } from './authService.js';

const GOOD_KEY = 'good-admin-key';

// Fake backend: GET /api/admin/session answers 200 only for the right Bearer key.
function installBackend() {
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    if (init.headers.Authorization === `Bearer ${GOOD_KEY}`) {
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    return {
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ statusCode: 401, message: 'Invalid or missing admin key', error: 'Unauthorized' }),
    };
  }));
}

const bad = () => authService.login('admin', 'wrong');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2030-01-07T10:00:00Z'));
  sessionStorage.clear();
  authService._reset();
  installBackend();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('authService', () => {
  it('validates the key against GET /api/admin/session sending it as Bearer', async () => {
    await authService.login('admin', GOOD_KEY);

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${APP_CONFIG.BACKEND_URL}/api/admin/session`);
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe(`Bearer ${GOOD_KEY}`);
  });

  it('stores the session and the key on a valid key', async () => {
    const result = await authService.login('admin', GOOD_KEY);
    expect(result).toEqual({ username: 'admin' });
    expect(sessionStorage.getItem('isAdmin')).toBe('true');
    expect(sessionStorage.getItem('adminUser')).toBe('admin');
    expect(sessionStorage.getItem('adminKey')).toBe(GOOD_KEY);
    expect(getAdminKey()).toBe(GOOD_KEY);
    expect(authService.isAuthenticated()).toBe(true);
    expect(authService.getUser()).toBe('admin');
  });

  it('no longer accepts the old hardcoded admin / admin123 credentials', async () => {
    await expect(authService.login('admin', 'admin123')).rejects.toThrow('Usuario o contraseña incorrectos');
    expect(authService.isAuthenticated()).toBe(false);
    expect(getAdminKey()).toBeNull();
  });

  it('rejects empty fields without calling the backend', async () => {
    await expect(authService.login('', 'x')).rejects.toThrow('Por favor completa todos los campos');
    await expect(authService.login('admin', '')).rejects.toThrow('Por favor completa todos los campos');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports the remaining attempts on a rejected key (4, 3, 2, 1)', async () => {
    for (const remaining of [4, 3, 2, 1]) {
      await expect(bad()).rejects.toThrow(`Usuario o contraseña incorrectos. Intentos restantes: ${remaining}`);
    }
    expect(sessionStorage.getItem('isAdmin')).toBeNull();
    expect(sessionStorage.getItem('adminKey')).toBeNull();
  });

  it('locks the account on the 5th failure and reports the countdown', async () => {
    for (let i = 0; i < 4; i++) await expect(bad()).rejects.toThrow();
    await expect(bad()).rejects.toThrow('Cuenta bloqueada por demasiados intentos. Intenta en 60 segundos.');

    await expect(bad()).rejects.toThrow('Demasiados intentos fallidos. Intenta de nuevo en 60 segundos.');

    vi.advanceTimersByTime(10_500);
    await expect(authService.login('admin', GOOD_KEY)).rejects.toThrow(
      'Demasiados intentos fallidos. Intenta de nuevo en 50 segundos.'
    );
  });

  it('does not even call the backend while locked out', async () => {
    for (let i = 0; i < 5; i++) await expect(bad()).rejects.toThrow();
    fetch.mockClear();

    await expect(authService.login('admin', GOOD_KEY)).rejects.toThrow(/Demasiados intentos fallidos/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('works again once the 60s lockout expires', async () => {
    for (let i = 0; i < 5; i++) await expect(bad()).rejects.toThrow();

    vi.advanceTimersByTime(59_999);
    await expect(authService.login('admin', GOOD_KEY)).rejects.toThrow(/Demasiados intentos fallidos/);

    vi.advanceTimersByTime(1);
    await expect(authService.login('admin', GOOD_KEY)).resolves.toEqual({ username: 'admin' });
  });

  it('resets the attempt counter after a successful login', async () => {
    await expect(bad()).rejects.toThrow();
    await expect(bad()).rejects.toThrow();
    await authService.login('admin', GOOD_KEY);
    await expect(bad()).rejects.toThrow('Intentos restantes: 4');
  });

  it('reports a network failure with a distinct message and does not count it as a failed attempt', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(bad()).rejects.toThrow('No se pudo conectar con el servidor. Intenta de nuevo en unos minutos.');

    fetch.mockImplementation(async () => ({ ok: false, status: 401, text: async () => '' }));
    await expect(bad()).rejects.toThrow('Intentos restantes: 4');
    expect(sessionStorage.getItem('isAdmin')).toBeNull();
  });

  it('reports a server error (5xx) like a connectivity problem, not as a wrong key', async () => {
    fetch.mockResolvedValue({ ok: false, status: 500, text: async () => '' });

    await expect(bad()).rejects.toThrow('No se pudo conectar con el servidor');
  });

  it('logout clears the session and the key', async () => {
    await authService.login('admin', GOOD_KEY);
    authService.logout();
    expect(sessionStorage.getItem('isAdmin')).toBeNull();
    expect(sessionStorage.getItem('adminUser')).toBeNull();
    expect(sessionStorage.getItem('adminKey')).toBeNull();
    expect(authService.isAuthenticated()).toBe(false);
    expect(authService.getUser()).toBeNull();
    expect(getAdminKey()).toBeNull();
  });
});
