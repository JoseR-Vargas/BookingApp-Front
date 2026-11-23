import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBooking, getAvailability, checkAvailability, buildBookingPayload } from './bookingService.js';
import { APP_CONFIG } from '../config/appConfig.js';
import { AxiosError } from 'axios';
import { installMockHttp, restoreHttp } from '../test/mockHttp.js';
import { ContractError } from '../schemas/contract-error.js';

let httpMock;

const okJson = (data) => ({ ok: true, status: 200, json: async () => data });

beforeEach(() => {
  httpMock = installMockHttp(vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  restoreHttp();
});

describe('bookingService HTTP contract', () => {
  it('createBooking POSTs JSON to /api/bookings', async () => {
    httpMock.mockResolvedValue(okJson({ _id: '1' }));
    const payload = { client: { name: 'Ana' }, status: 'confirmed' };

    const result = await createBooking(payload);

    expect(result).toEqual({ _id: '1' });
    expect(httpMock).toHaveBeenCalledTimes(1);
    const [url, init] = httpMock.mock.calls[0];
    expect(url).toBe(`${APP_CONFIG.BACKEND_URL}/api/bookings`);
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify(payload));
  });

  it('createBooking keeps the one-time cancelToken of the response, untouched', async () => {
    httpMock.mockResolvedValue(okJson({ _id: '1', cancelToken: 'secret-token' }));

    const result = await createBooking({ client: { name: 'Ana' } });

    expect(result.cancelToken).toBe('secret-token');
  });

  it('createBooking waits at most 30000ms', async () => {
    httpMock.mockResolvedValue(okJson({ _id: '1' }));

    await createBooking({ a: 1 });

    expect(httpMock.mock.calls[0][1].timeout).toBe(30000);
  });

  it('createBooking reports a timed-out request with the Spanish Timeout message', async () => {
    httpMock.mockRejectedValue(new AxiosError('timeout of 30000ms exceeded', AxiosError.ECONNABORTED));

    await expect(createBooking({ a: 1 })).rejects.toThrow(/Timeout/);
  });

  it('getAvailability GETs /api/availability with the date and the comma-separated service ids', async () => {
    const availability = { date: '2030-01-07', closed: false, professionals: [] };
    httpMock.mockResolvedValue(okJson(availability));

    const result = await getAvailability('2030-01-07', ['consulta-inicial', 'servicio-basico']);

    expect(result).toEqual(availability);
    const [url, init] = httpMock.mock.calls[0];
    expect(url).toBe(`${APP_CONFIG.BACKEND_URL}/api/availability?date=2030-01-07&serviceIds=consulta-inicial,servicio-basico`);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('getAvailability sends the location when one is chosen, and no locationId otherwise', async () => {
    httpMock.mockResolvedValue(okJson({ date: '2030-01-07', closed: false, professionals: [] }));

    await getAvailability('2030-01-07', ['servicio-basico'], { timeout: 1000, locationId: 'centro' });
    await getAvailability('2030-01-07', ['servicio-basico'], { timeout: 1000 });

    expect(httpMock.mock.calls[0][0]).toBe(`${APP_CONFIG.BACKEND_URL}/api/availability?date=2030-01-07&serviceIds=servicio-basico&locationId=centro`);
    expect(httpMock.mock.calls[1][0]).toBe(`${APP_CONFIG.BACKEND_URL}/api/availability?date=2030-01-07&serviceIds=servicio-basico`);
  });

  it('getAvailability forwards the timeout option', async () => {
    httpMock.mockResolvedValue(okJson({ date: '2030-01-07', closed: false, professionals: [] }));

    await getAvailability('2030-01-07', ['servicio-basico'], { timeout: 15000 });

    expect(httpMock.mock.calls[0][1].timeout).toBe(15000);
  });
});

describe('public booking calls never carry the admin key', () => {
  it('createBooking, getAvailability and checkAvailability send no Authorization even with an admin session open', async () => {
    sessionStorage.setItem('adminKey', 'secret');
    httpMock.mockImplementation(async (url) => {
      if (url.includes('/api/availability?')) return okJson({ date: '2030-01-15', closed: false, professionals: [] });
      if (url.endsWith('/availability')) return okJson({ available: true });
      return okJson({ _id: '1' });
    });

    await createBooking({ client: { name: 'Ana' } });
    await getAvailability('2030-01-15', ['consulta-inicial']);
    await checkAvailability('2030-01-15', '10:00', 'alex-garcia', ['consulta-inicial']);

    expect(httpMock).toHaveBeenCalledTimes(3);
    for (const [, init] of httpMock.mock.calls) {
      expect(init.headers.Authorization).toBeUndefined();
    }
    sessionStorage.clear();
  });
});

describe('bookingService.checkAvailability', () => {
  it('POSTs the whole window to /api/bookings/availability and returns the verdict', async () => {
    httpMock.mockResolvedValue(okJson({ available: false }));

    const available = await checkAvailability('2030-01-07', '10:00', 'alex-garcia', ['servicio-basico', 'servicio-premium']);

    expect(available).toBe(false);
    const [url, init] = httpMock.mock.calls[0];
    expect(url).toBe(`${APP_CONFIG.BACKEND_URL}/api/bookings/availability`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      date: '2030-01-07',
      time: '10:00',
      professionalId: 'alex-garcia',
      serviceIds: ['servicio-basico', 'servicio-premium'],
    });
  });

  it('sends the location of the check when one is chosen', async () => {
    httpMock.mockResolvedValue(okJson({ available: true }));

    await checkAvailability('2030-01-07', '10:00', 'alex-garcia', ['servicio-basico'], 'centro');

    expect(JSON.parse(httpMock.mock.calls[0][1].body)).toEqual({
      date: '2030-01-07',
      time: '10:00',
      professionalId: 'alex-garcia',
      serviceIds: ['servicio-basico'],
      locationId: 'centro',
    });
  });

  it('is true when the backend says the window is free', async () => {
    httpMock.mockResolvedValue(okJson({ available: true }));

    expect(await checkAvailability('2030-01-07', '09:00', 'maria-lopez', ['servicio-basico'])).toBe(true);
  });

  it('propagates request failures (the caller decides to fail open)', async () => {
    httpMock.mockRejectedValue(new Error('boom'));

    await expect(checkAvailability('2030-01-07', '09:00', 'maria-lopez', ['servicio-basico'])).rejects.toThrow('boom');
  });
});

describe('buildBookingPayload', () => {
  const services = [
    { id: 'servicio-basico', name: 'Servicio Básico', price: 1200, duration: 60, icon: 'x', description: 'y' },
    { id: 'servicio-premium', name: 'Servicio Premium', price: 2500, duration: 90, icon: 'z', description: 'w' },
  ];
  const professional = { id: 'alex-garcia', name: 'Alex García', rating: 4.9 };

  it('produces exactly the wire shape (service ids only), escaping user text', () => {
    const payload = buildBookingPayload({
      formData: {
        name: `<b>O'Brien</b> & "Co"`,
        id: '1234567-8',
        email: 'a@b.com',
        phone: '099123456',
        notes: `<script>alert('x')</script>`,
      },
      services,
      professional,
      date: '2030-01-07',
      time: '10:00',
    });

    expect(payload).toEqual({
      client: {
        name: '&lt;b&gt;O&#x27;Brien&lt;/b&gt; &amp; &quot;Co&quot;',
        id: '1234567-8',
        email: 'a@b.com',
        phone: '099123456',
      },
      services: [{ id: 'servicio-basico' }, { id: 'servicio-premium' }],
      professional: { id: 'alex-garcia', name: 'Alex García' },
      date: '2030-01-07',
      time: '10:00',
      notes: '&lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt;',
      status: 'confirmed',
    });
    expect(Object.keys(payload)).toEqual(['client', 'services', 'professional', 'date', 'time', 'notes', 'status']);
    expect(Object.keys(payload.client)).toEqual(['name', 'id', 'email', 'phone']);
  });

  it('adds the chosen location (id only) after the other fields, and nothing without one', () => {
    const args = {
      formData: { name: 'Ana', email: 'a@b.com', phone: '1' },
      services,
      professional,
      date: '2030-01-07',
      time: '10:00',
    };

    expect(buildBookingPayload({ ...args, location: { id: 'centro', name: 'Centro' } }).location).toEqual({ id: 'centro' });
    expect(buildBookingPayload(args)).not.toHaveProperty('location');
  });

  it('defaults an empty client id and notes to empty strings', () => {
    const payload = buildBookingPayload({
      formData: { name: 'Ana', email: 'a@b.com', phone: '1' },
      services,
      professional,
      date: '2030-01-07',
      time: '10:00',
    });
    expect(payload.client.id).toBe('');
    expect(payload.notes).toBe('');
  });
});

describe('bookingService response contract', () => {
  it('getAvailability rejects with a ContractError when professionals is missing', async () => {
    httpMock.mockResolvedValue(okJson({ date: '2030-01-07', closed: false }));

    await expect(getAvailability('2030-01-07', ['servicio-basico'])).rejects.toBeInstanceOf(ContractError);
  });

  it('getAvailability accepts a field the backend added later', async () => {
    const answer = { date: '2030-01-07', closed: false, professionals: [], brandNew: 1 };
    httpMock.mockResolvedValue(okJson(answer));

    expect(await getAvailability('2030-01-07', ['servicio-basico'])).toEqual(answer);
  });

  it('createBooking rejects with a ContractError when the answer has no _id', async () => {
    httpMock.mockResolvedValue(okJson({ ok: true }));

    await expect(createBooking({ a: 1 })).rejects.toBeInstanceOf(ContractError);
  });

  it('checkAvailability rejects with a ContractError when "available" is not a boolean', async () => {
    httpMock.mockResolvedValue(okJson({ available: 'yes' }));

    await expect(checkAvailability('2030-01-15', '10:00', 'alex-garcia', ['consulta-inicial']))
      .rejects.toBeInstanceOf(ContractError);
  });
});
