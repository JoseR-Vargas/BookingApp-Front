// SPEC 08: a business with two locations. The admin creates a second one, gives it its own hours and
// lets a professional rotate between both; the public picks the location when booking, and a booking at
// one location blocks the same professional at the other. Local backend + throwaway Mongo; fake data only.
import { test, expect } from '../../fixtures/test.js';
import { BookingModal } from '../../pages/booking/BookingModal.js';
import { AdminConfigPage } from '../../pages/admin/AdminConfigPage.js';
import { createApi } from '../../support/api.js';
import { nextWeekday } from '../../support/dates.js';
import { SEED_WEEKLY } from '../../data/seedSchedule.js';
import { ADMIN_KEY, BACKEND_ORIGIN, FAKE_EMAIL_DOMAIN } from '../../support/env.js';

const RUN = Date.now().toString(36);
const HEADERS = { Authorization: `Bearer ${ADMIN_KEY}` };
const NAME = `E2E Local ${RUN}`;
const ADDRESS = `Calle Falsa ${RUN}`;
const DAY = nextWeekday(3, 1); // a Wednesday, open 09:00-20:00 at the principal location
const CLIENT = { name: `E2E Client ${RUN}`, email: `e2e+${RUN}@${FAKE_EMAIL_DOMAIN}`, phone: '+59800000000' };

// The second location opens Wednesdays 10:00-14:00 and offers a start every hour.
const SECOND_WEEKLY = { ...SEED_WEEKLY, 3: { closed: false, open: '10:00', close: '14:00' } };

let api;
const state = {};

test.describe.configure({ mode: 'serial' });

test.describe('multi-location, end to end', () => {
  const put = (request, path, data) => request.put(`${BACKEND_ORIGIN}${path}`, { headers: HEADERS, data });
  const patch = (request, path, data) => request.patch(`${BACKEND_ORIGIN}${path}`, { headers: HEADERS, data });
  const availability = async (request, locationId) => {
    const response = await request.get(`${BACKEND_ORIGIN}/api/availability`, {
      params: { date: DAY, serviceIds: 'consulta-inicial', ...(locationId ? { locationId } : {}) },
    });
    expect(response.status()).toBe(200);
    return response.json();
  };

  test.beforeAll(async () => {
    api = await createApi();
    await api.assertThrowawayDatabase();
    await api.cleanup();
  });

  test.afterAll(async ({ playwright }) => {
    // Leave one active location and the seeded professionals as the other specs expect them.
    const ctx = await playwright.request.newContext();
    if (state.pageOn) await put(ctx, '/api/admin/public-availability', { enabled: false, days: 7, serviceIds: null });
    if (state.locationId) await put(ctx, `/api/admin/locations/${state.locationId}`, { name: NAME, address: ADDRESS, active: false });
    await patch(ctx, '/api/admin/professionals/alex-garcia', { locations: ['principal'] });
    await ctx.dispose();
    await api.cleanup();
    await api.dispose();
  });

  test('a business that never added a location keeps its principal one, and nothing asks for a location', async ({ request, page }) => {
    const catalog = await api.adminCatalog();
    expect(catalog.locations.filter((l) => l.active)).toHaveLength(1);
    expect(catalog.locations[0]).toMatchObject({ id: 'principal', name: 'Principal' });

    const booking = new BookingModal(page);
    await booking.open();
    await booking.chooseService('consulta-inicial');
    await expect(booking.dialog.getByRole('radiogroup', { name: 'Local' })).toHaveCount(0);
    await expect(booking.professionalCard('alex-garcia')).toBeVisible();
    expect((await availability(request)).location).toMatchObject({ id: 'principal' });
  });

  test('the admin creates a second location in "Locales" and it shows in Horarios', async ({ context }) => {
    const admin = await AdminConfigPage.open(context);
    const { page } = admin;
    await admin.openTab('locations');

    await page.getByRole('button', { name: 'Nuevo local' }).click();
    await page.getByTestId('location-name-input').fill(NAME);
    await page.getByTestId('location-address-input').fill(ADDRESS);
    await page.getByTestId('location-save').click();
    await expect(page.getByText('Local creado')).toBeVisible();

    const row = page.getByTestId(/^location-row-/).filter({ hasText: NAME });
    await expect(row).toContainText(ADDRESS);
    state.locationId = (await row.getAttribute('data-testid')).replace('location-row-', '');

    await page.getByTestId('config-tab-schedule').click();
    await expect(page.getByLabel('Local')).toBeVisible();
    await expect(page.getByLabel('Local').locator('option')).toHaveCount(2);
  });

  test('the second location has its own hours, and Alex rotates between both while María stays at the principal', async ({ request }) => {
    const saved = await put(request, `/api/admin/locations/${state.locationId}/schedule`, { weekly: SECOND_WEEKLY, startIntervalMinutes: 60 });
    expect(saved.status()).toBe(200);
    expect((await saved.json()).schedule.startIntervalMinutes).toBe(60);

    expect((await patch(request, '/api/admin/professionals/alex-garcia', { locations: ['principal', state.locationId] })).status()).toBe(200);

    const second = await availability(request, state.locationId);
    expect(second.professionals.map((p) => p.id)).toEqual(['alex-garcia']);
    expect(second.professionals[0].slots).toEqual(['10:00', '11:00', '12:00', '13:00']);

    const principal = await availability(request, 'principal');
    expect(principal.professionals.map((p) => p.id).sort()).toEqual(['alex-garcia', 'maria-lopez']);
    expect(principal.professionals[0].slots).toContain('09:30'); // the principal keeps its own 30-minute grid
  });

  test('the public chooses the location when booking: only its professionals, its hours', async ({ page }) => {
    const booking = new BookingModal(page);
    await booking.open();
    await booking.chooseService('consulta-inicial');

    const group = booking.dialog.getByRole('radiogroup', { name: 'Local' });
    await expect(group.getByRole('radio')).toHaveCount(2);
    await expect(booking.dialog.getByText('Elige un local para ver los profesionales')).toBeVisible();

    await group.getByRole('radio', { name: new RegExp(NAME) }).click();
    await expect(booking.professionalCard('alex-garcia')).toBeVisible();
    await expect(booking.professionalCard('maria-lopez')).toHaveCount(0);

    await booking.professionalCard('alex-garcia').click();
    await booking.setDate(DAY);
    expect(await booking.slots()).toEqual(['10:00', '11:00', '12:00', '13:00']);
    await booking.pickTime('11:00');
    await booking.next();
    await booking.fillClient(CLIENT);

    const confirmation = await booking.submit();
    await expect(confirmation).toContainText(NAME);
    await confirmation.getByRole('button', { name: /Entendido/ }).click();

    const stored = (await api.bookings()).find((b) => b.client.email === CLIENT.email);
    expect(stored.location).toMatchObject({ id: state.locationId, name: NAME });
    state.bookingId = stored._id;
  });

  test('/disponibilidad lets the public pick the location too', async ({ page, request }) => {
    expect((await put(request, '/api/admin/public-availability', { enabled: true, days: 14, serviceIds: null })).status()).toBe(200);
    state.pageOn = true;

    await page.goto('/disponibilidad');
    const group = page.getByRole('radiogroup', { name: 'Local' });
    await expect(group.getByRole('radio')).toHaveCount(2);
    await group.getByRole('radio', { name: new RegExp(NAME) }).click();

    // The second location offers a start every hour, from its own 10:00 opening.
    const times = page.locator(`[data-testid^="availability-time-${DAY}-"]`);
    await expect(times.first()).toHaveText('10:00');
    await expect(page.getByTestId(`availability-time-${DAY}-10:30`)).toHaveCount(0);
    await expect(page.getByTestId(`availability-time-${DAY}-11:00`)).toHaveCount(0); // Alex took it at this location
  });

  test('the same professional is blocked at the other location at that time', async ({ request }) => {
    const principal = await availability(request, 'principal');
    const alex = principal.professionals.find((p) => p.id === 'alex-garcia');
    expect(alex.slots).not.toContain('11:00');
    expect(alex.slots).toContain('11:30'); // a 30-minute service took only the 11:00 block
  });
});
