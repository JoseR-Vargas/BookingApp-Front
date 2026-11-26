// SPEC 24: a booking inside the reminder window gets one reminder, only once; a canceled booking and a client
// without phone or email get none. The sender is the simulator, so nothing leaves the machine.
import { test, expect } from '../../fixtures/test.js';
import { createApi } from '../../support/api.js';
import { mongosh } from '../../support/mongo.js';
import { nextWeekday } from '../../support/dates.js';
import { ADMIN_KEY, BACKEND_ORIGIN, FAKE_EMAIL_DOMAIN } from '../../support/env.js';

const KEY = { Authorization: `Bearer ${ADMIN_KEY}` };
const fakeClient = (name) => ({ name, email: `${name}@${FAKE_EMAIL_DOMAIN}`, phone: '3001234567' });

let api;
const createdIds = [];

test.describe.configure({ mode: 'serial' });
test.describe('reminders, end to end', () => {
  test.beforeAll(async () => {
    api = await createApi();
    await api.assertThrowawayDatabase();
  });

  test.afterAll(async () => {
    // Every booking of this suite is removed, even the one with no email.
    for (const id of createdIds) {
      await api.ctx.delete(`/api/bookings/${id}`, { headers: api.auth });
    }
    await api.cleanup();
    await api.dispose();
  });

  test('the owner configures the reminders and reads them back', async ({ request }) => {
    const saved = await request.put(`${BACKEND_ORIGIN}/api/admin/reminders`, {
      headers: KEY,
      data: { enabled: true, channels: ['email'], hoursBefore: [240, 24], template: 'Hola {cliente}, tu cita es el {fecha} a las {hora} en {negocio}. {cancelar}' },
    });
    expect(saved.status()).toBe(200);
    const body = JSON.parse(await saved.text());
    expect(body.config.enabled).toBe(true);
    expect(body.config.channels).toEqual(['email']);
    expect(body.config.hoursBefore).toEqual([240, 24]);
    expect(body.allowsReminders).toBe(true);

    const read = await request.get(`${BACKEND_ORIGIN}/api/admin/reminders`, { headers: KEY });
    const state = JSON.parse(await read.text());
    expect(state.config.template).toContain('{cliente}');
    expect(state.counters).toHaveProperty('sent');
    expect(state.counters).toHaveProperty('failed');
  });

  test('a booking inside the window gets one reminder and never a second one', async ({ request }) => {
    // The window opens 240 hours before the appointment: any booking of the week is inside it.
    const date = nextWeekday(2, 1);
    const created = await request.post(`${BACKEND_ORIGIN}/api/bookings`, {
      data: {
        client: fakeClient('recordatorio'),
        date,
        time: '10:00',
        services: [{ id: 'consulta-inicial' }],
        professional: { id: 'alex-garcia', name: 'ignored' },
      },
    });
    expect(created.status()).toBe(201);
    const bookingId = (await created.json())._id;
    createdIds.push(bookingId);

    // The scheduler runs every three seconds in the e2e.
    await expect.poll(async () => {
      const bookings = JSON.parse(await (await request.get(`${BACKEND_ORIGIN}/api/bookings`, { headers: KEY })).text());
      const booking = bookings.find((one) => one._id === bookingId);
      return (booking?.reminders ?? []).length;
    }, { timeout: 30_000, intervals: [1_000] }).toBeGreaterThan(0);

    const after = JSON.parse(await (await request.get(`${BACKEND_ORIGIN}/api/bookings/${bookingId}`, { headers: KEY })).text());
    const pairs = after.reminders.map((one) => `${one.kind}:${one.channel}`);
    // One reminder per window and channel, and never two of the same.
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(pairs.length).toBeGreaterThan(0);
    expect(after.reminders.every((one) => one.ok)).toBe(true);
    // The only channel is the email.
    expect(new Set(after.reminders.map((one) => one.channel))).toEqual(new Set(['email']));

    // A second round does not send it again.
    const count = after.reminders.length;
    await new Promise((resolve) => setTimeout(resolve, 8_000));
    const later = JSON.parse(await (await request.get(`${BACKEND_ORIGIN}/api/bookings/${bookingId}`, { headers: KEY })).text());
    expect(later.reminders.length).toBe(count);
  });

  test('a canceled booking is not reminded, even when its window opens', async ({ request }) => {
    // A date a month ahead, on an open day, so the window can be opened for it later.
    let date = '';
    for (let days = 28; days <= 34; days += 1) {
      const candidate = new Date(Date.now() + days * 86_400_000);
      if (candidate.getUTCDay() !== 0) {
        date = candidate.toISOString().slice(0, 10);
        break;
      }
    }
    const created = await request.post(`${BACKEND_ORIGIN}/api/bookings`, {
      data: {
        client: fakeClient('cancelado'),
        date,
        time: '10:00',
        services: [{ id: 'consulta-inicial' }],
        professional: { id: 'alex-garcia', name: 'ignored' },
      },
    });
    expect(created.status()).toBe(201);
    const bookingId = (await created.json())._id;
    createdIds.push(bookingId);

    // Canceled before its window opens.
    expect((await request.patch(`${BACKEND_ORIGIN}/api/bookings/${bookingId}`, { headers: KEY, data: { status: 'cancelled' } })).status()).toBe(200);

    // The window of that date opens now (720 hours before a booking a month away).
    const saved = await request.put(`${BACKEND_ORIGIN}/api/admin/reminders`, {
      headers: KEY,
      data: { enabled: true, channels: ['email'], hoursBefore: [720], template: 'Hola {cliente}' },
    });
    expect(saved.status()).toBe(200);

    // A booking that is not canceled, with the same window, is reminded: the round did run.
    const alive = await request.post(`${BACKEND_ORIGIN}/api/bookings`, {
      data: {
        client: fakeClient('vigente'),
        date,
        time: '12:00',
        services: [{ id: 'consulta-inicial' }],
        professional: { id: 'alex-garcia', name: 'ignored' },
      },
    });
    expect(alive.status()).toBe(201);
    const aliveId = (await alive.json())._id;
    createdIds.push(aliveId);

    await expect.poll(async () => {
      const booking = JSON.parse(await (await request.get(`${BACKEND_ORIGIN}/api/bookings/${aliveId}`, { headers: KEY })).text());
      return (booking.reminders ?? []).length;
    }, { timeout: 30_000, intervals: [1_000] }).toBeGreaterThan(0);

    const canceled = JSON.parse(await (await request.get(`${BACKEND_ORIGIN}/api/bookings/${bookingId}`, { headers: KEY })).text());
    expect(canceled.reminders ?? []).toEqual([]);
  });

  test('a client with only a phone is not reminded', async ({ request }) => {
    const date = nextWeekday(4, 1);
    const created = await request.post(`${BACKEND_ORIGIN}/api/bookings`, {
      data: {
        client: { name: 'Solo telefono', email: '', phone: '3009876543' },
        date,
        time: '12:00',
        services: [{ id: 'consulta-inicial' }],
        professional: { id: 'alex-garcia', name: 'ignored' },
      },
    });
    expect(created.status()).toBe(201);
    const bookingId = (await created.json())._id;
    createdIds.push(bookingId);

    // Without an email there is no channel: nothing is sent and nothing is recorded.
    await new Promise((resolve) => setTimeout(resolve, 8_000));
    const booking = JSON.parse(await (await request.get(`${BACKEND_ORIGIN}/api/bookings/${bookingId}`, { headers: KEY })).text());
    expect(booking.reminders ?? []).toEqual([]);
  });
});
