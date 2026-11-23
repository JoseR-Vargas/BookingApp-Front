// SPEC 07: the public availability page (/disponibilidad). The admin turns it on in Configuración →
// Compartir; the public sees the free turns in real time and books one with the professional they
// choose among those free at that time. Local backend + throwaway Mongo; fake data only (see e2e/support/env.js).
import { test, expect } from '../../fixtures/test.js';
import { AdminConfigPage } from '../../pages/admin/AdminConfigPage.js';
import { createApi } from '../../support/api.js';
import { nextWeekday } from '../../support/dates.js';
import { ADMIN_KEY, BACKEND_ORIGIN, FAKE_EMAIL_DOMAIN } from '../../support/env.js';

const RUN = Date.now().toString(36);
const HEADERS = { Authorization: `Bearer ${ADMIN_KEY}` };
const DAY = nextWeekday(3, 1); // a Wednesday, open 09:00-20:00 in the seed
const OFF = { enabled: false, days: 7, serviceIds: null };

let api;

test.describe.configure({ mode: 'serial' });

test.describe('public availability page, end to end', () => {
  const putSettings = (request, data) => request.put(`${BACKEND_ORIGIN}/api/admin/public-availability`, { headers: HEADERS, data });

  test.beforeAll(async ({ playwright }) => {
    api = await createApi();
    await api.assertThrowawayDatabase();
    await api.cleanup();
    const ctx = await playwright.request.newContext();
    await putSettings(ctx, OFF);
    await ctx.dispose();
  });

  test.afterAll(async ({ playwright }) => {
    await api.cleanup();
    const ctx = await playwright.request.newContext();
    await putSettings(ctx, OFF);
    await ctx.dispose();
    await api.dispose();
  });

  test('is off by default: the API and the page say so', async ({ page, request }) => {
    const response = await request.get(`${BACKEND_ORIGIN}/api/public-availability`);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ enabled: false });

    await page.goto('/disponibilidad');
    await expect(page.getByText('Esta página no está disponible por ahora.')).toBeVisible();
  });

  test('the admin turns it on in Compartir, picks 14 days and sees the link', async ({ context }) => {
    const admin = await AdminConfigPage.open(context);
    const { page } = admin;
    await admin.openTab('share');

    await expect(page.getByTestId('share-link')).toHaveValue(/\/disponibilidad$/);
    await page.getByTestId('share-enabled').check();
    await page.getByTestId('share-days').selectOption('14');
    await page.getByTestId('share-save').click();
    await expect(page.getByText('Configuración guardada')).toBeVisible();

    expect((await api.adminCatalog()).publicAvailability).toEqual({ enabled: true, days: 14, serviceIds: null });
  });

  test('the public API merges the professionals and hides services that are not published', async ({ request }) => {
    const response = await request.get(`${BACKEND_ORIGIN}/api/public-availability`, { params: { serviceId: 'consulta-inicial' } });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.days).toHaveLength(14);
    const day = body.days.find((entry) => entry.date === DAY);
    expect(day.times.find((entry) => entry.time === '12:00').professionals.map((p) => p.id).sort()).toEqual(['alex-garcia', 'maria-lopez']);
    expect(JSON.stringify(body)).not.toMatch(/price|email|phone|client/);

    expect((await request.get(`${BACKEND_ORIGIN}/api/public-availability`, { params: { serviceId: 'nope' } })).status()).toBe(404);
  });

  test('the public picks a time, chooses the professional among the free ones and books it', async ({ page }) => {
    await page.goto('/disponibilidad');
    await expect(page.getByRole('heading', { name: 'Turnos disponibles' })).toBeVisible();
    await page.getByRole('radio', { name: /Consulta Inicial/ }).click();

    await page.getByTestId(`availability-time-${DAY}-12:00`).click();
    const picker = page.getByRole('dialog', { name: '¿Con quién quieres reservar?' });
    await expect(picker.getByRole('button')).toHaveText(['Alex García', 'María López', 'Cancelar']);
    await picker.getByRole('button', { name: 'Alex García' }).click();

    const dialog = page.getByRole('dialog', { name: 'Reservar tu Cita' });
    await expect(dialog.getByRole('heading', { name: 'Tus Datos' })).toBeVisible();
    await dialog.locator('input[name="name"]').fill(`E2E Client ${RUN}`);
    await dialog.locator('input[name="email"]').fill(`e2e+${RUN}@${FAKE_EMAIL_DOMAIN}`);
    await dialog.locator('input[name="phone"]').fill('+59800000000');
    await dialog.locator('input[name="terms"]').check();
    await dialog.getByRole('button', { name: 'Confirmar Reserva' }).click();

    const confirmation = page.getByRole('dialog', { name: '¡Reserva Confirmada!' });
    await expect(confirmation).toContainText('Alex García');
    await expect(confirmation).toContainText('12:00');
    await confirmation.getByRole('button', { name: /Entendido/ }).click();

    const bookings = (await api.bookings()).filter((b) => b.date === DAY && b.time === '12:00');
    expect(bookings).toHaveLength(1);
    expect(bookings[0].professional.id).toBe('alex-garcia');
  });

  test('the booked professional is gone from that time: only María is left and no picker is asked', async ({ page }) => {
    await page.goto('/disponibilidad');
    await page.getByRole('radio', { name: /Consulta Inicial/ }).click();

    await page.getByTestId(`availability-time-${DAY}-12:00`).click();

    await expect(page.getByRole('dialog', { name: '¿Con quién quieres reservar?' })).toHaveCount(0);
    const dialog = page.getByRole('dialog', { name: 'Reservar tu Cita' });
    await expect(dialog.getByRole('heading', { name: 'Tus Datos' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Anterior' }).click();
    await expect(dialog.getByTestId('selected-service-info')).toContainText('María López');
  });

  test('turning the page off again hides everything', async ({ request, page }) => {
    expect((await putSettings(request, OFF)).status()).toBe(200);

    expect(await (await request.get(`${BACKEND_ORIGIN}/api/public-availability`)).json()).toEqual({ enabled: false });
    await page.goto('/disponibilidad');
    await expect(page.getByText('Esta página no está disponible por ahora.')).toBeVisible();
  });
});
