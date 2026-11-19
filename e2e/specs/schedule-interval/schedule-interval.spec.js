// SPEC 05: the admin picks the interval between turns in "Horarios"; the public booking modal, the
// availability API and the booking API then offer and accept only those start times. Occupancy stays on
// the 30-minute grid. Local backend + throwaway Mongo; fake data only (see e2e/support/env.js).
import { test, expect } from '../../fixtures/test.js';
import { BookingModal } from '../../pages/booking/BookingModal.js';
import { AdminConfigPage } from '../../pages/admin/AdminConfigPage.js';
import { createApi } from '../../support/api.js';
import { nextWeekday } from '../../support/dates.js';
import { SEED_WEEKLY } from '../../data/seedSchedule.js';
import { ADMIN_KEY, BACKEND_ORIGIN, FAKE_EMAIL_DOMAIN } from '../../support/env.js';

const RUN = Date.now().toString(36);
const HEADERS = { Authorization: `Bearer ${ADMIN_KEY}` };
const DAY = nextWeekday(3); // a Wednesday, open 09:00-20:00 in the seed
const CLIENT = (tag) => ({ name: `E2E Client ${tag} ${RUN}`, email: `e2e+${tag}${RUN}@${FAKE_EMAIL_DOMAIN}`, phone: '+59800000000' });
const NOT_OFFERED = /el horario 10:00 no está disponible/;

let api;
const state = {};

test.describe.configure({ mode: 'serial' });

test.describe('schedule start interval, end to end', () => {
  const availability = async (request, serviceId) => {
    const response = await request.get(`${BACKEND_ORIGIN}/api/availability`, { params: { date: DAY, serviceIds: serviceId } });
    expect(response.status()).toBe(200);
    return (await response.json()).professionals.find((p) => p.id === 'alex-garcia').slots;
  };
  const bookingPayload = (tag, time, serviceId) => ({
    client: CLIENT(tag),
    date: DAY,
    time,
    services: [{ id: serviceId }],
    professional: { id: 'alex-garcia', name: 'ignored: the server takes it from the catalog' },
  });
  const putSchedule = (request, data) => request.put(`${BACKEND_ORIGIN}/api/admin/schedule`, { headers: HEADERS, data });

  test.beforeAll(async () => {
    api = await createApi();
    await api.assertThrowawayDatabase();
    await api.cleanup(); // seed hours and the 30-minute start interval
  });

  test.afterAll(async () => {
    await api.cleanup();
    if (state.serviceId) await api.ctx.delete(`/api/admin/services/${state.serviceId}`, { headers: HEADERS });
    await api.dispose();
  });

  test('by default the public sees the usual 30-minute grid', async ({ request }) => {
    expect((await api.adminCatalog()).schedule.startIntervalMinutes).toBe(30);
    const slots = await availability(request, 'consulta-inicial');
    expect(slots.slice(0, 4)).toEqual(['09:00', '09:30', '10:00', '10:30']);
    expect(slots).toHaveLength(22);
  });

  test('the admin picks 3 hours in Horarios: the selector previews it and saving stores it', async ({ context }) => {
    const admin = await AdminConfigPage.open(context);
    const { page } = admin;
    await admin.openTab('schedule');

    const selector = page.getByLabel('Intervalo entre turnos');
    await expect(selector).toHaveValue('30');
    const preview = page.getByTestId('schedule-interval-preview');
    await expect(preview).toContainText('09:00, 09:30, 10:00');

    await selector.selectOption('180');
    await expect(preview).toContainText('09:00, 12:00, 15:00, 18:00');
    await expect(preview).not.toContainText('09:30');

    await admin.saveSchedule();
    await expect(page.getByText('Horarios guardados')).toBeVisible();
    expect((await api.adminCatalog()).schedule.startIntervalMinutes).toBe(180);
    expect((await (await page.request.get(`${BACKEND_ORIGIN}/api/catalog`)).json()).schedule.startIntervalMinutes).toBe(180);
  });

  test('the public booking modal offers only those hours, and a 3-hour service stops where it still fits', async ({ page, request }) => {
    const booking = new BookingModal(page);
    await booking.open();
    await booking.chooseService('consulta-inicial');
    await booking.professionalCard('alex-garcia').click();
    await booking.setDate(DAY);
    expect(await booking.slots()).toEqual(['09:00', '12:00', '15:00', '18:00']);

    const created = await request.post(`${BACKEND_ORIGIN}/api/admin/services`, {
      headers: HEADERS,
      data: { name: `E2E Three Hours ${RUN}`, description: `Fake service ${RUN}`, price: 100, duration: 180, professionals: ['alex-garcia'] },
    });
    expect(created.status()).toBe(201);
    state.serviceId = (await created.json()).id;
    // 18:00 + 3 h would run past the 20:00 closing time.
    expect(await availability(request, state.serviceId)).toEqual(['09:00', '12:00', '15:00']);
  });

  test('the booking API rejects an hour that is not offered and accepts one that is', async ({ request }) => {
    const rejected = await request.post(`${BACKEND_ORIGIN}/api/bookings`, { data: bookingPayload('a', '10:00', 'consulta-inicial') });
    expect(rejected.status()).toBe(400);
    expect(JSON.stringify(await rejected.json())).toMatch(NOT_OFFERED);

    const accepted = await request.post(`${BACKEND_ORIGIN}/api/bookings`, { data: bookingPayload('b', '12:00', 'consulta-inicial') });
    expect(accepted.status()).toBe(201);
    // Occupancy is still on 30-minute blocks: that block is gone, the rest of the offer stays.
    expect(await availability(request, 'consulta-inicial')).toEqual(['09:00', '15:00', '18:00']);
  });

  test('a PUT that leaves the interval out keeps it, and an invalid one is refused', async ({ request }) => {
    const kept = await putSchedule(request, { weekly: SEED_WEEKLY });
    expect(kept.status()).toBe(200);
    expect((await kept.json()).schedule.startIntervalMinutes).toBe(180);
    expect((await api.adminCatalog()).schedule.startIntervalMinutes).toBe(180);

    for (const startIntervalMinutes of [45, 0, 500, 'abc', null, 1.5]) {
      const bad = await putSchedule(request, { weekly: SEED_WEEKLY, startIntervalMinutes });
      expect(bad.status(), String(startIntervalMinutes)).toBe(400);
      expect(JSON.stringify(await bad.json())).toContain('El intervalo entre turnos debe ser un múltiplo de 30 minutos, entre 30 y 480.');
    }
    expect((await api.adminCatalog()).schedule.startIntervalMinutes).toBe(180);
    expect((await request.put(`${BACKEND_ORIGIN}/api/admin/schedule`, { data: { weekly: SEED_WEEKLY } })).status()).toBe(401);
  });

  test('going back to 30 minutes restores the grid, and the booking made at 12:00 stays valid', async ({ request }) => {
    const restored = await putSchedule(request, { weekly: SEED_WEEKLY, startIntervalMinutes: 30 });
    expect(restored.status()).toBe(200);
    expect((await restored.json()).schedule.startIntervalMinutes).toBe(30);

    const slots = await availability(request, 'consulta-inicial');
    expect(slots).toContain('09:30');
    expect(slots).not.toContain('12:00'); // booked earlier
    expect((await api.bookings()).filter((b) => b.date === DAY && b.time === '12:00')).toHaveLength(1);
  });
});
