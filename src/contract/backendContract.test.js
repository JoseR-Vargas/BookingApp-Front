// Static pin of what the frontend sends against what BookingApp_Back requires.
//
// Backend facts (read from ../BookingApp_Back, which this test never modifies):
//  - CreateBookingDto is a plain class with NO class-validator decorators and main.ts registers
//    NO global ValidationPipe, so there are no length/regex/enum limits at the HTTP layer.
//  - The real constraints are the Mongoose `Booking` schema `required` flags (a missing required
//    value yields "Error de validación" -> 400) and the explicit checks in BookingsService.create().
//  - A booking holds N services: only `services[].id` is trusted (name, price and duration come from
//    the backend catalog), ids must be unique and the professional must offer all of them.
// The validator below encodes exactly those constraints, strictly (exact JS types, no coercion).

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));

import { io } from 'socket.io-client';
import { APP_CONFIG } from '../config/appConfig.js';
import { PROFESSIONALS, SERVICES } from '../test/catalogFixture.js';
import { buildBookingPayload } from '../services/bookingService.js';
import * as bookingService from '../services/bookingService.js';
import * as adminService from '../services/adminService.js';
import * as cancellationService from '../services/cancellationService.js';
import { authService } from '../services/authService.js';
import * as catalogService from '../services/catalogService.js';
import { connectBookingSocket } from '../services/realtimeService.js';

// --- Encoded backend constraints (src/bookings/schemas/booking.schema.ts + bookings.service.ts) ---

const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0;
const isString = (v) => typeof v === 'string';
const isServiceRefList = (v) => (
  Array.isArray(v)
  && v.length > 0
  && v.every((s) => s && isNonEmptyString(s.id) && Object.keys(s).length === 1)
  && new Set(v.map((s) => s.id)).size === v.length
);

// field path -> [predicate, description]
const REQUIRED = {
  'client.name': [isNonEmptyString, 'non-empty string'],
  'client.phone': [isNonEmptyString, 'non-empty string'],
  services: [isServiceRefList, 'non-empty list of unique { id } references'],
  'professional.id': [isNonEmptyString, 'non-empty string'],
  'professional.name': [isNonEmptyString, 'non-empty string'],
  date: [isNonEmptyString, 'non-empty string'],
  time: [isNonEmptyString, 'non-empty string'],
};
const OPTIONAL = {
  'client.id': [isString, 'string'],
  'client.email': [isString, 'string'],
  notes: [isString, 'string'],
  status: [isString, 'string'],
};

const getPath = (obj, path) => path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);

// Mirrors the Mongoose schema + service-level checks. Returns a list of violations (empty = accepted).
function validateCreateBooking(payload) {
  const errors = [];
  for (const [path, [ok, label]] of Object.entries(REQUIRED)) {
    if (!ok(getPath(payload, path))) errors.push(`${path} must be a ${label}`);
  }
  for (const [path, [ok, label]] of Object.entries(OPTIONAL)) {
    const value = getPath(payload, path);
    if (value !== undefined && !ok(value)) errors.push(`${path} must be a ${label}`);
  }
  return errors;
}

// Fixture: worst case for escaping (every sanitized character present) and a real catalog entry.
const BOOKED_SERVICES = SERVICES.slice(0, 2);
const PROFESSIONAL = PROFESSIONALS[0];
const NASTY = `Ana "O'Brien" <b>&</b>`;

const payloadFor = (formData) => buildBookingPayload({
  formData,
  services: BOOKED_SERVICES,
  professional: PROFESSIONAL,
  date: '2030-01-15',
  time: '10:00',
});

describe('POST /api/bookings payload vs CreateBookingDto / Booking schema', () => {
  it('satisfies every required field and type for a regular booking', () => {
    const payload = payloadFor({
      name: 'Ana Pérez', id: '12345678', email: 'ana@example.com', phone: '+54 11 5555-1234', notes: 'First visit',
    });

    expect(validateCreateBooking(payload)).toEqual([]);
    expect(payload.status).toBe('confirmed');
    expect(payload.time).toMatch(/^\d{2}:00$/);
    expect(payload.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('satisfies the contract when the optional id and notes are left empty', () => {
    const payload = payloadFor({ name: 'Ana', email: 'ana@example.com', phone: '555' });

    expect(validateCreateBooking(payload)).toEqual([]);
    expect(payload.client.id).toBe('');
    expect(payload.notes).toBe('');
  });

  it('still satisfies the contract after HTML escaping (no length/regex limit exists server-side)', () => {
    const payload = payloadFor({ name: NASTY, id: NASTY, email: 'a@b.co', phone: '1', notes: NASTY });

    expect(validateCreateBooking(payload)).toEqual([]);
    // Documented behavior: the ESCAPED text is what is persisted (legacy data compatibility).
    expect(payload.client.name).toBe('Ana &quot;O&#x27;Brien&quot; &lt;b&gt;&amp;&lt;/b&gt;');
    expect(payload.notes).toBe(payload.client.name);
  });

  it('sends only keys the schema knows about (nothing is silently dropped or rejected)', () => {
    const payload = payloadFor({ name: 'Ana', id: '1', email: 'a@b.co', phone: '1', notes: 'n' });

    expect(Object.keys(payload).sort()).toEqual(
      ['client', 'date', 'notes', 'professional', 'services', 'status', 'time'],
    );
    expect(Object.keys(payload.client).sort()).toEqual(['email', 'id', 'name', 'phone']);
    expect(payload.services).toEqual(BOOKED_SERVICES.map(({ id }) => ({ id })));
    expect(Object.keys(payload.professional).sort()).toEqual(['id', 'name']);
  });

  it('the whole catalog booked together with any professional produces an accepted payload', () => {
    for (const professional of PROFESSIONALS) {
      const payload = buildBookingPayload({
        formData: { name: 'Ana', email: 'a@b.co', phone: '1' },
        services: SERVICES,
        professional,
        date: '2030-01-15',
        time: '09:00',
      });
      expect(validateCreateBooking(payload)).toEqual([]);
      expect(payload.services).toHaveLength(SERVICES.length);
    }
  });

  it('the validator itself rejects what the backend would reject (guards against a vacuous test)', () => {
    const good = payloadFor({ name: 'Ana', email: 'a@b.co', phone: '1' });

    expect(validateCreateBooking({ ...good, client: { ...good.client, phone: '' } })).toContain(
      'client.phone must be a non-empty string',
    );
    const refList = 'services must be a non-empty list of unique { id } references';
    expect(validateCreateBooking({ ...good, services: [] })).toContain(refList);
    expect(validateCreateBooking({ ...good, services: [{ id: 'a' }, { id: 'a' }] })).toContain(refList);
    expect(validateCreateBooking({ ...good, services: [{ id: 'a', price: 1 }] })).toContain(refList);
    expect(validateCreateBooking({ ...good, professional: undefined })).toContain(
      'professional.id must be a non-empty string',
    );
    expect(validateCreateBooking({ ...good, date: undefined })).toContain('date must be a non-empty string');
  });
});

// --- Endpoints and socket event ---

// Backend route table: global prefix 'api' (main.ts) + @Controller('bookings') + method decorators.
const BACKEND_ROUTES = [
  ['POST', '/api/bookings'],
  ['GET', '/api/bookings'],
  ['POST', '/api/bookings/availability'],
  ['GET', '/api/availability'],
  ['GET', '/api/bookings/statistics'],
  ['GET', '/api/bookings/:id'],
  ['PATCH', '/api/bookings/:id'],
  ['DELETE', '/api/bookings/:id'],
  ['GET', '/api/bookings/cancel/:token'],
  ['POST', '/api/bookings/cancel/:token'],
  ['GET', '/api/catalog'],
  ['GET', '/api/admin/session'],
  ['GET', '/api/admin/catalog'],
  ['POST', '/api/admin/professionals'],
  ['PATCH', '/api/admin/professionals/:id'],
  ['DELETE', '/api/admin/professionals/:id'],
  ['POST', '/api/admin/services'],
  ['PATCH', '/api/admin/services/:id'],
  ['DELETE', '/api/admin/services/:id'],
  ['PUT', '/api/admin/schedule'],
];

const matchesRoute = (method, url) => BACKEND_ROUTES.some(([m, template]) => (
  m === method && new RegExp(`^${template.replace(/:\w+/g, '[^/]+')}$`).test(url.split('?')[0])
));

// Routes of /api/bookings that the backend protects with ADMIN_API_KEY. The rest of the bookings
// controller is public: creating a booking, availability, and the token-based cancel routes.
const ADMIN_BOOKING_ROUTES = [
  ['GET', '/api/bookings'],
  ['GET', '/api/bookings/statistics'],
  ['DELETE', '/api/bookings/:id'],
  ['PATCH', '/api/bookings/:id'],
];

const isAdminBookingRoute = (method, url) => ADMIN_BOOKING_ROUTES.some(([m, template]) => (
  m === method && new RegExp(`^${template.replace(/:\w+/g, '[^/]+')}$`).test(url.split('?')[0])
));

describe('endpoints used by the services exist in the backend controller', () => {
  let calls;

  beforeEach(() => {
    sessionStorage.setItem('adminKey', 'k');
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      calls.push({
        method: options.method,
        url: String(url).replace(APP_CONFIG.BACKEND_URL, ''),
        auth: options.headers.Authorization,
      });
      return { ok: true, json: async () => [] };
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('every call issued by bookingService, cancellationService and adminService maps to a backend route', async () => {
    await bookingService.createBooking(payloadFor({ name: 'Ana', email: 'a@b.co', phone: '1' }));
    await bookingService.getAvailability('2030-01-15', ['consulta-inicial', 'servicio-basico']);
    await bookingService.checkAvailability('2030-01-15', '10:00', 'alex-garcia', ['consulta-inicial']);
    await cancellationService.getCancellation('tok_en-123');
    await cancellationService.cancelByToken('tok_en-123');
    await adminService.getBookings();
    await adminService.getStatistics();
    await adminService.deleteBooking('665f1c2e9b1d4a0012345678');
    await adminService.cancelBooking('665f1c2e9b1d4a0012345678');

    expect(calls.map(({ method, url }) => ({ method, url }))).toEqual([
      { method: 'POST', url: '/api/bookings' },
      { method: 'GET', url: '/api/availability?date=2030-01-15&serviceIds=consulta-inicial,servicio-basico' },
      { method: 'POST', url: '/api/bookings/availability' },
      { method: 'GET', url: '/api/bookings/cancel/tok_en-123' },
      { method: 'POST', url: '/api/bookings/cancel/tok_en-123' },
      { method: 'GET', url: '/api/bookings' },
      { method: 'GET', url: '/api/bookings/statistics' },
      { method: 'DELETE', url: '/api/bookings/665f1c2e9b1d4a0012345678' },
      { method: 'PATCH', url: '/api/bookings/665f1c2e9b1d4a0012345678' },
    ]);
    for (const { method, url } of calls) {
      expect(matchesRoute(method, url), `${method} ${url}`).toBe(true);
    }
  });

  it('only the admin booking routes carry the Bearer key; the public ones never do', async () => {
    await bookingService.createBooking(payloadFor({ name: 'Ana', email: 'a@b.co', phone: '1' }));
    await bookingService.getAvailability('2030-01-15', ['consulta-inicial']);
    await bookingService.checkAvailability('2030-01-15', '10:00', 'alex-garcia', ['consulta-inicial']);
    await cancellationService.getCancellation('tok_en-123');
    await cancellationService.cancelByToken('tok_en-123');
    await adminService.getBookings();
    await adminService.getStatistics();
    await adminService.deleteBooking('665f1c2e9b1d4a0012345678');
    await adminService.cancelBooking('665f1c2e9b1d4a0012345678');

    expect(calls).toHaveLength(9);
    for (const { method, url, auth } of calls) {
      expect(auth, `${method} ${url}`).toBe(isAdminBookingRoute(method, url) ? 'Bearer k' : undefined);
    }
  });
});

describe('catalog and admin config endpoints exist in the backend contract', () => {
  let calls;

  beforeEach(() => {
    sessionStorage.setItem('adminKey', 'k');
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      calls.push({
        method: options.method,
        url: String(url).replace(APP_CONFIG.BACKEND_URL, ''),
        auth: options.headers.Authorization,
      });
      return { ok: true, json: async () => ({}) };
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('every catalog / admin call maps to a backend route; only admin routes carry the Bearer key', async () => {
    await catalogService.getCatalog();
    await authService.login('admin', 'k');
    await adminService.getAdminCatalog();
    await adminService.createProfessional({ name: 'Ana', specialty: 'x', experience: '1' });
    await adminService.updateProfessional('ana', { active: false });
    await adminService.deleteProfessional('ana');
    await adminService.createService({ name: 'Corte' });
    await adminService.updateService('corte', { price: 1 });
    await adminService.deleteService('corte');
    await adminService.saveSchedule({ 0: { closed: true } });

    for (const { method, url, auth } of calls) {
      expect(matchesRoute(method, url), `${method} ${url}`).toBe(true);
      expect(auth, `${method} ${url}`).toBe(url.startsWith('/api/admin') ? 'Bearer k' : undefined);
    }
    expect(calls).toHaveLength(10);
  });
});

describe('Socket.IO contract', () => {
  it("listens to the 'newBooking' event on the backend base URL", () => {
    const handlers = {};
    io.mockReturnValue({ on: (event, cb) => { handlers[event] = cb; }, disconnect: vi.fn() });

    connectBookingSocket(APP_CONFIG.BACKEND_URL, { onNewBooking: vi.fn() });

    expect(io).toHaveBeenCalledWith(APP_CONFIG.BACKEND_URL);
    expect(Object.keys(handlers)).toContain('newBooking');
  });
});

// --- Cross-check against the real backend source when the sibling repo is checked out ---

const BACK = resolve(process.cwd(), '../BookingApp_Back/src');
const backendAvailable = existsSync(resolve(BACK, 'bookings/bookings.controller.ts'));

describe.skipIf(!backendAvailable)('cross-check with ../BookingApp_Back source (sibling checkout)', () => {
  const read = (rel) => readFileSync(resolve(BACK, rel), 'utf8');

  it('controller declares the pinned routes under the global /api prefix', () => {
    const controller = read('bookings/bookings.controller.ts');
    const main = read('main.ts');

    expect(main).toMatch(/setGlobalPrefix\(\s*'api'/);
    expect(controller).toMatch(/@Controller\(\s*'bookings'\s*\)/);
    expect(controller).toMatch(/@Post\(\)\s+async create\(/);
    expect(controller).toMatch(/@Get\(\)\s+findAll\(/);
    expect(controller).toMatch(/@Get\(\s*'statistics'\s*\)/);
    expect(controller).toMatch(/@Delete\(\s*':id'\s*\)/);
  });

  it('availability endpoints take the date and the comma-separated service ids', () => {
    const availability = read('availability/availability.controller.ts');
    const bookings = read('bookings/bookings.controller.ts');

    expect(availability).toMatch(/@Controller\(\s*'availability'\s*\)/);
    expect(availability).toMatch(/@Query\(\s*'date'\s*\)/);
    expect(availability).toMatch(/@Query\(\s*'serviceIds'\s*\)/);
    expect(bookings).toMatch(/@Post\(\s*'availability'\s*\)/);
    expect(bookings).toMatch(/professionalId: string;\s+serviceIds: string\[\];/);
  });

  it("gateway emits the 'newBooking' event", () => {
    expect(read('bookings/bookings.gateway.ts')).toMatch(/\.emit\(\s*'newBooking'/);
  });

  it('DTO still carries no validation decorators and no global ValidationPipe is registered', () => {
    // If this fails the backend started enforcing limits: re-derive the validator above.
    expect(read('bookings/dto/create-booking.dto.ts')).not.toMatch(/@Is|@Length|@Matches|@Min|@Max/);
    expect(read('main.ts')).not.toMatch(/ValidationPipe/);
    expect(read('app.module.ts')).not.toMatch(/ValidationPipe/);
  });

  it('DTO and schema hold a list of services (no singular service) and the optional client leaves', () => {
    const dto = read('bookings/dto/create-booking.dto.ts');
    const schema = read('bookings/schemas/booking.schema.ts');

    expect(dto).toMatch(/services: \{ id: string \}\[\];/);
    expect(dto).not.toMatch(/^\s+service:/m);
    expect(schema).toMatch(/services: BookedService\[\];/);
    expect(schema).not.toMatch(/^\s+service:/m);
    expect(schema).toMatch(/id: \{ type: String, required: false \}/);
    expect(schema).toMatch(/email: \{ type: String, required: false \}/);
    expect(schema).toMatch(/@Prop\(\{ required: true \}\)\s+date: string;/);
    expect(schema).toMatch(/@Prop\(\{ required: true \}\)\s+time: string;/);
  });
});
