import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getBookings,
  getStatistics,
  deleteBooking,
  getAdminCatalog,
  createProfessional,
  updateProfessional,
  deleteProfessional,
  createService,
  updateService,
  deleteService,
  saveSchedule,
} from './adminService.js';
import { authService } from './authService.js';
import { APP_CONFIG } from '../config/appConfig.js';

const okJson = (data) => ({ ok: true, status: 200, json: async () => data });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson({})));
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('adminService HTTP contract', () => {
  it('getBookings => GET /api/bookings', async () => {
    await getBookings();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${APP_CONFIG.BACKEND_URL}/api/bookings`);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('getStatistics => GET /api/bookings/statistics', async () => {
    await getStatistics();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${APP_CONFIG.BACKEND_URL}/api/bookings/statistics`);
    expect(init.method).toBe('GET');
  });

  it('deleteBooking(id) => DELETE /api/bookings/<id> with no body', async () => {
    await deleteBooking('abc123');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${APP_CONFIG.BACKEND_URL}/api/bookings/abc123`);
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });

  it('keeps the booking calls free of the admin key (the backend does not protect them)', async () => {
    sessionStorage.setItem('adminKey', 'secret');
    await getBookings();
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('returns the parsed response body', async () => {
    fetch.mockResolvedValue(okJson({ totalBookings: 3 }));
    expect(await getStatistics()).toEqual({ totalBookings: 3 });
  });
});

describe('adminService config endpoints', () => {
  const cases = [
    ['getAdminCatalog', () => getAdminCatalog(), 'GET', '/api/admin/catalog', undefined],
    ['createProfessional', () => createProfessional({ name: 'Ana' }), 'POST', '/api/admin/professionals', { name: 'Ana' }],
    ['updateProfessional', () => updateProfessional('ana', { active: false }), 'PATCH', '/api/admin/professionals/ana', { active: false }],
    ['deleteProfessional', () => deleteProfessional('ana'), 'DELETE', '/api/admin/professionals/ana', undefined],
    ['createService', () => createService({ name: 'Corte' }), 'POST', '/api/admin/services', { name: 'Corte' }],
    ['updateService', () => updateService('corte', { price: 10 }), 'PATCH', '/api/admin/services/corte', { price: 10 }],
    ['deleteService', () => deleteService('corte'), 'DELETE', '/api/admin/services/corte', undefined],
    ['saveSchedule', () => saveSchedule({ 0: { closed: true } }), 'PUT', '/api/admin/schedule', { weekly: { 0: { closed: true } } }],
  ];

  it.each(cases)('%s sends the Bearer admin key to the right route', async (_name, call, method, path, body) => {
    sessionStorage.setItem('adminKey', 'secret');

    await call();

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${APP_CONFIG.BACKEND_URL}${path}`);
    expect(init.method).toBe(method);
    expect(init.headers.Authorization).toBe('Bearer secret');
    if (body === undefined) expect(init.body).toBeUndefined();
    else expect(JSON.parse(init.body)).toEqual(body);
  });

  it('surfaces the backend 400 message', async () => {
    sessionStorage.setItem('adminKey', 'secret');
    fetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ statusCode: 400, message: 'duration must be an integer between 5 and 480' }),
    });

    await expect(createService({})).rejects.toThrow('duration must be an integer between 5 and 480');
  });

  describe('401 handling', () => {
    let assign;

    beforeEach(() => {
      assign = vi.fn();
      vi.stubGlobal('location', { ...window.location, assign });
      sessionStorage.setItem('isAdmin', 'true');
      sessionStorage.setItem('adminUser', 'admin');
      sessionStorage.setItem('adminKey', 'stale');
      fetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ statusCode: 401, message: 'Invalid or missing admin key' }),
      });
    });

    it('logs the user out and sends them to /login, still rejecting the call', async () => {
      await expect(getAdminCatalog()).rejects.toThrow('Invalid or missing admin key');

      expect(authService.isAuthenticated()).toBe(false);
      expect(sessionStorage.getItem('adminKey')).toBeNull();
      expect(assign).toHaveBeenCalledWith('/login');
    });
  });
});
