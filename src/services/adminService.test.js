import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getBookings,
  getStatistics,
  deleteBooking,
  cancelBooking,
  getAdminCatalog,
  createProfessional,
  updateProfessional,
  deleteProfessional,
  deleteProfessionalPermanently,
  deleteServicePermanently,
  createService,
  updateService,
  deleteService,
  saveSchedule,
  savePublicAvailability,
  createLocation,
  updateLocation,
  saveLocationSchedule,
  saveBranding,
  uploadLogo,
  deleteLogo,
  uploadProfessionalPhoto,
  deleteProfessionalPhoto,
} from './adminService.js';
import { authService } from './authService.js';
import { APP_CONFIG } from '../config/appConfig.js';
import { ADMIN_CATALOG } from '../test/catalogFixture.js';
import { installMockHttp, restoreHttp } from '../test/mockHttp.js';
import { ContractError } from '../schemas/contract-error.js';

let httpMock;

const okJson = (data) => ({ ok: true, status: 200, json: async () => data });

// Every read the service validates gets a well-formed body; the other calls only need some JSON.
const bodyFor = (url) => {
  if (url.endsWith('/api/bookings')) return [];
  if (url.endsWith('/api/admin/catalog')) return ADMIN_CATALOG;
  return {};
};

beforeEach(() => {
  httpMock = installMockHttp(vi.fn(async (url) => okJson(bodyFor(url))));
});

afterEach(() => {
  vi.unstubAllGlobals();
  restoreHttp();
  sessionStorage.clear();
});

describe('adminService username header', () => {
  it('sends the logged-in username in X-Admin-Username with every admin request', async () => {
    sessionStorage.setItem('adminKey', 'secret');
    sessionStorage.setItem('adminUser', 'barberia');

    await getBookings();

    const [, init] = httpMock.mock.calls[0];
    expect(init.headers['X-Admin-Username']).toBe('barberia');
    expect(init.headers.Authorization).toBe('Bearer secret');
  });

  it('omits the header when there is no username (never sends "null")', async () => {
    sessionStorage.setItem('adminKey', 'secret');

    await getBookings();

    const [, init] = httpMock.mock.calls[0];
    expect(init.headers).not.toHaveProperty('X-Admin-Username');
  });
});

describe('adminService HTTP contract', () => {
  it('getBookings => GET /api/bookings', async () => {
    await getBookings();
    const [url, init] = httpMock.mock.calls[0];
    expect(url).toBe(`${APP_CONFIG.BACKEND_URL}/api/bookings`);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('getStatistics => GET /api/bookings/statistics', async () => {
    await getStatistics();
    const [url, init] = httpMock.mock.calls[0];
    expect(url).toBe(`${APP_CONFIG.BACKEND_URL}/api/bookings/statistics`);
    expect(init.method).toBe('GET');
  });

  it('deleteBooking(id) => DELETE /api/bookings/<id> with no body', async () => {
    await deleteBooking('abc123');
    const [url, init] = httpMock.mock.calls[0];
    expect(url).toBe(`${APP_CONFIG.BACKEND_URL}/api/bookings/abc123`);
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });

  it.each([
    ['getBookings', () => getBookings(), 'GET', '/api/bookings', undefined],
    ['getStatistics', () => getStatistics(), 'GET', '/api/bookings/statistics', undefined],
    ['deleteBooking', () => deleteBooking('abc123'), 'DELETE', '/api/bookings/abc123', undefined],
    ['cancelBooking', () => cancelBooking('abc123'), 'PATCH', '/api/bookings/abc123', { status: 'cancelled' }],
  ])('%s sends the Bearer admin key (the backend now protects these routes)', async (_name, call, method, path, body) => {
    sessionStorage.setItem('adminKey', 'secret');

    await call();

    const [url, init] = httpMock.mock.calls[0];
    expect(url).toBe(`${APP_CONFIG.BACKEND_URL}${path}`);
    expect(init.method).toBe(method);
    expect(init.headers.Authorization).toBe('Bearer secret');
    if (body === undefined) expect(init.body).toBeUndefined();
    else expect(JSON.parse(init.body)).toEqual(body);
  });

  it('cancelBooking keeps the history: it marks the booking cancelled instead of deleting it', async () => {
    sessionStorage.setItem('adminKey', 'secret');

    await cancelBooking('abc123');

    expect(httpMock.mock.calls[0][1].method).toBe('PATCH');
    expect(httpMock.mock.calls[0][1].method).not.toBe('DELETE');
  });

  it('returns the parsed response body', async () => {
    httpMock.mockResolvedValue(okJson({ totalBookings: 3 }));
    expect(await getStatistics()).toEqual({ totalBookings: 3 });
  });
});

describe('adminService config endpoints', () => {
  const cases = [
    ['getAdminCatalog', () => getAdminCatalog(), 'GET', '/api/admin/catalog', undefined],
    ['createProfessional', () => createProfessional({ name: 'Ana' }), 'POST', '/api/admin/professionals', { name: 'Ana' }],
    ['updateProfessional', () => updateProfessional('ana', { active: false }), 'PATCH', '/api/admin/professionals/ana', { active: false }],
    ['deleteProfessional', () => deleteProfessional('ana'), 'DELETE', '/api/admin/professionals/ana', undefined],
    ['deleteServicePermanently', () => deleteServicePermanently('corte'), 'DELETE', '/api/admin/services/corte/permanent', undefined],
    ['deleteProfessionalPermanently', () => deleteProfessionalPermanently('ana'), 'DELETE', '/api/admin/professionals/ana/permanent', undefined],
    ['createService', () => createService({ name: 'Corte' }), 'POST', '/api/admin/services', { name: 'Corte' }],
    ['updateService', () => updateService('corte', { price: 10 }), 'PATCH', '/api/admin/services/corte', { price: 10 }],
    ['deleteService', () => deleteService('corte'), 'DELETE', '/api/admin/services/corte', undefined],
    ['saveSchedule', () => saveSchedule({ 0: { closed: true } }), 'PUT', '/api/admin/schedule', { weekly: { 0: { closed: true } } }],
    ['savePublicAvailability', () => savePublicAvailability({ enabled: true, days: 5, serviceIds: null }), 'PUT', '/api/admin/public-availability', { enabled: true, days: 5, serviceIds: null }],
    ['createLocation', () => createLocation({ name: 'Centro', address: 'Calle 1' }), 'POST', '/api/admin/locations', { name: 'Centro', address: 'Calle 1' }],
    ['updateLocation', () => updateLocation('centro', { name: 'Centro', address: 'Calle 1', active: false }), 'PUT', '/api/admin/locations/centro', { name: 'Centro', address: 'Calle 1', active: false }],
    ['saveLocationSchedule', () => saveLocationSchedule('centro', { 0: { closed: true } }), 'PUT', '/api/admin/locations/centro/schedule', { weekly: { 0: { closed: true } } }],
    ['saveLocationSchedule with the start interval', () => saveLocationSchedule('centro', { 0: { closed: true } }, 60), 'PUT', '/api/admin/locations/centro/schedule', { weekly: { 0: { closed: true } }, startIntervalMinutes: 60 }],
    ['saveSchedule with the start interval', () => saveSchedule({ 0: { closed: true } }, 180), 'PUT', '/api/admin/schedule', { weekly: { 0: { closed: true } }, startIntervalMinutes: 180 }],
    ['saveBranding', () => saveBranding({ businessName: 'Pepe', colors: { accent: '#c9a96e' } }), 'PUT', '/api/admin/branding', { businessName: 'Pepe', colors: { accent: '#c9a96e' } }],
    ['uploadLogo', () => uploadLogo('data:image/png;base64,AAAA'), 'PUT', '/api/admin/branding/logo', { dataUrl: 'data:image/png;base64,AAAA' }],
    ['deleteLogo', () => deleteLogo(), 'DELETE', '/api/admin/branding/logo', undefined],
    ['uploadProfessionalPhoto', () => uploadProfessionalPhoto('ana', 'data:image/jpeg;base64,AAAA'), 'PUT', '/api/admin/professionals/ana/photo', { dataUrl: 'data:image/jpeg;base64,AAAA' }],
    ['deleteProfessionalPhoto', () => deleteProfessionalPhoto('ana'), 'DELETE', '/api/admin/professionals/ana/photo', undefined],
    ['createProfessional with a photo', () => createProfessional({ name: 'Ana', photoDataUrl: 'data:image/jpeg;base64,AAAA' }), 'POST', '/api/admin/professionals', { name: 'Ana', photoDataUrl: 'data:image/jpeg;base64,AAAA' }],
  ];

  it.each(cases)('%s sends the Bearer admin key to the right route', async (_name, call, method, path, body) => {
    sessionStorage.setItem('adminKey', 'secret');

    await call();

    const [url, init] = httpMock.mock.calls[0];
    expect(url).toBe(`${APP_CONFIG.BACKEND_URL}${path}`);
    expect(init.method).toBe(method);
    expect(init.headers.Authorization).toBe('Bearer secret');
    if (body === undefined) expect(init.body).toBeUndefined();
    else expect(JSON.parse(init.body)).toEqual(body);
  });

  it('surfaces the backend 400 message', async () => {
    sessionStorage.setItem('adminKey', 'secret');
    httpMock.mockResolvedValue({
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
      httpMock.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ statusCode: 401, message: 'Invalid or missing admin key' }),
      });
    });

    it.each([
      ['getAdminCatalog', () => getAdminCatalog()],
      ['getBookings', () => getBookings()],
      ['getStatistics', () => getStatistics()],
      ['deleteBooking', () => deleteBooking('abc123')],
      ['cancelBooking', () => cancelBooking('abc123')],
    ])('%s: logs the user out and sends them to /login, still rejecting the call', async (_name, call) => {
      await expect(call()).rejects.toThrow('Invalid or missing admin key');

      expect(authService.isAuthenticated()).toBe(false);
      expect(sessionStorage.getItem('adminKey')).toBeNull();
      expect(assign).toHaveBeenCalledWith('/login');
    });
  });
});

describe('adminService response contract', () => {
  beforeEach(() => {
    sessionStorage.setItem('adminKey', 'secret');
  });

  it('getAdminCatalog rejects with a ContractError when the schedule is missing', async () => {
    httpMock.mockResolvedValue(okJson({ professionals: [], services: [] }));

    await expect(getAdminCatalog()).rejects.toBeInstanceOf(ContractError);
  });

  it('getAdminCatalog returns a valid catalog untouched', async () => {
    httpMock.mockResolvedValue(okJson(ADMIN_CATALOG));

    expect(await getAdminCatalog()).toEqual(ADMIN_CATALOG);
  });

  it('getBookings rejects with a ContractError when the answer is not a list', async () => {
    httpMock.mockResolvedValue(okJson({ bookings: [] }));

    await expect(getBookings()).rejects.toBeInstanceOf(ContractError);
  });

  it('getStatistics rejects with a ContractError when a counter is not a number', async () => {
    httpMock.mockResolvedValue(okJson({ totalBookings: 'many' }));

    await expect(getStatistics()).rejects.toBeInstanceOf(ContractError);
  });
});
