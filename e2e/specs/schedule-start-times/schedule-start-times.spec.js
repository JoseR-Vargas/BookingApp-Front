// SPEC 06: the admin picks the exact start times of each day in "Horarios". The public availability and
// the booking API then follow that day's list; days without a list keep the global interval.
// Local backend + throwaway Mongo; fake data only (see e2e/support/env.js).
import { test, expect } from '../../fixtures/test.js';
import { AdminConfigPage } from '../../pages/admin/AdminConfigPage.js';
import { createApi } from '../../support/api.js';
import { nextWeekday } from '../../support/dates.js';
import { SEED_WEEKLY } from '../../data/seedSchedule.js';
import { ADMIN_KEY, BACKEND_ORIGIN, FAKE_EMAIL_DOMAIN } from '../../support/env.js';

const RUN = Date.now().toString(36);
const HEADERS = { Authorization: `Bearer ${ADMIN_KEY}` };
const MONDAY = nextWeekday(1);
const WEDNESDAY = nextWeekday(3);
const LIST_MESSAGE = 'Las horas de inicio de cada día deben ser una lista sin repetidos de horas HH:mm.';
const RANGE_MESSAGE = 'Las horas de inicio deben estar dentro del horario del día y ser múltiplos de 30 minutos.';

let api;

test.describe.configure({ mode: 'serial' });

test.describe('start times per day, end to end', () => {
  const availability = async (request, date) => {
    const response = await request.get(`${BACKEND_ORIGIN}/api/availability`, { params: { date, serviceIds: 'consulta-inicial' } });
    expect(response.status()).toBe(200);
    return (await response.json()).professionals.find((p) => p.id === 'alex-garcia').slots;
  };
  const putWeekly = (request, weekly) => request.put(`${BACKEND_ORIGIN}/api/admin/schedule`, { headers: HEADERS, data: { weekly } });
  const book = (request, tag, time) => request.post(`${BACKEND_ORIGIN}/api/bookings`, {
    data: {
      client: { name: `E2E Client ${tag} ${RUN}`, email: `e2e+${tag}${RUN}@${FAKE_EMAIL_DOMAIN}`, phone: '+59800000000' },
      date: MONDAY,
      time,
      services: [{ id: 'consulta-inicial' }],
      professional: { id: 'alex-garcia', name: 'ignored: the server takes it from the catalog' },
    },
  });

  test.beforeAll(async () => {
    api = await createApi();
    await api.assertThrowawayDatabase();
    await api.cleanup(); // seed hours, no lists, 30-minute interval
  });

  test.afterAll(async () => {
    await api.cleanup();
    await api.dispose();
  });

  test('the admin chooses the hours of Monday only; the public sees them, other days keep the interval', async ({ context, request }) => {
    const admin = await AdminConfigPage.open(context);
    const { page } = admin;
    await admin.openTab('schedule');

    await page.getByTestId('schedule-interval').selectOption('180');
    await page.getByTestId('schedule-custom-1').check();
    await page.getByTestId('schedule-start-1-16:00').check({ force: true });
    await page.getByTestId('schedule-start-1-12:00').uncheck({ force: true });
    await expect(page.getByTestId('schedule-interval-preview')).toContainText('09:00, 15:00, 16:00, 18:00');
    await admin.saveSchedule();
    await expect(page.getByText('Horarios guardados')).toBeVisible();

    const { weekly } = (await api.adminCatalog()).schedule;
    expect(weekly[1].starts).toEqual(['09:00', '15:00', '16:00', '18:00']);
    expect(weekly[3]).not.toHaveProperty('starts');

    expect(await availability(request, MONDAY)).toEqual(['09:00', '15:00', '16:00', '18:00']);
    expect(await availability(request, WEDNESDAY)).toEqual(['09:00', '12:00', '15:00', '18:00']);
  });

  test('the booking API accepts a listed hour and rejects one that is not', async ({ request }) => {
    const rejected = await book(request, 'a', '12:00');
    expect(rejected.status()).toBe(400);
    expect(JSON.stringify(await rejected.json())).toMatch(/el horario 12:00 no está disponible/);

    expect((await book(request, 'b', '16:00')).status()).toBe(201);
    expect(await availability(request, MONDAY)).toEqual(['09:00', '15:00', '18:00']);
  });

  test('invalid lists are refused with 400 and the stored week is kept', async ({ request }) => {
    const open = { closed: false, open: '09:00', close: '20:00' };
    const cases = [
      [[], LIST_MESSAGE],
      [['10:00', '10:00'], LIST_MESSAGE],
      [['10:15'], RANGE_MESSAGE],
      [['20:00'], RANGE_MESSAGE],
    ];
    for (const [starts, message] of cases) {
      const response = await putWeekly(request, { ...SEED_WEEKLY, 1: { ...open, starts } });
      expect(response.status(), JSON.stringify(starts)).toBe(400);
      expect(JSON.stringify(await response.json())).toContain(message);
    }
    expect((await api.adminCatalog()).schedule.weekly[1].starts).toEqual(['09:00', '15:00', '16:00', '18:00']);
    expect((await request.put(`${BACKEND_ORIGIN}/api/admin/schedule`, { data: { weekly: SEED_WEEKLY } })).status()).toBe(401);
  });

  test('a PUT without the list clears it and the day follows the interval again; the booking made stays', async ({ request }) => {
    expect((await putWeekly(request, SEED_WEEKLY)).status()).toBe(200);

    expect((await api.adminCatalog()).schedule.weekly[1]).not.toHaveProperty('starts');
    expect(await availability(request, MONDAY)).toEqual(['09:00', '12:00', '15:00', '18:00']);
    expect((await api.bookings()).filter((b) => b.date === MONDAY && b.time === '16:00')).toHaveLength(1);
  });
});
