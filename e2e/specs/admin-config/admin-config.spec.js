// Spec 01 (dashboard-config-admin), step 13: admin login -> configure the business -> book on the public
// site, end to end against the local backend + throwaway Mongo. Fake data only; see e2e/support/env.js.
// One serial flow: every test builds on the professional/service/booking created by the previous ones.
import { test, expect } from '../../fixtures/test.js';
import { BookingModal } from '../../pages/booking/BookingModal.js';
import { AdminConfigPage } from '../../pages/admin/AdminConfigPage.js';
import { createApi } from '../../support/api.js';
import { nextWeekday } from '../../support/dates.js';
import { ADMIN_KEY, BACKEND_ORIGIN, FAKE_EMAIL_DOMAIN } from '../../support/env.js';

const RUN = Date.now().toString(36);
const PRO = { name: `E2E Pro ${RUN}`, specialty: 'E2E Specialty', experience: '3 años' };
const SERVICE = { name: `E2E Service ${RUN}`, description: `Fake service for run ${RUN}`, price: 4321, duration: 50 };
const CLIENT = { name: `E2E Client ${RUN}`, email: `e2e+${RUN}@${FAKE_EMAIL_DOMAIN}`, phone: '+59800000000' };

const BOOKING_DAY = nextWeekday(3); // Wednesday
const THURSDAY = nextWeekday(4);
const FRIDAY = nextWeekday(5);
const SATURDAY = nextWeekday(6);
const BOOKING_TIME = '17:00';

const state = {}; // ids created by the flow
let api;

test.describe.configure({ mode: 'serial' });

test.describe('admin configuration, end to end', () => {
  test.beforeAll(async () => {
    api = await createApi();
    await api.assertThrowawayDatabase();
    await api.cleanup(); // bookings of aborted runs + seed schedule
  });

  test.afterAll(async () => {
    await api.cleanup({ serviceId: state.serviceId, professionalId: state.professionalId });
    await api.dispose();
  });

  test('login rejects a wrong key and the retired default credentials', async ({ page }) => {
    await page.goto('/login');
    for (const [user, password] of [['admin', 'not-the-key'], ['admin', 'admin123']]) {
      await page.locator('#username').fill(user);
      await page.locator('#password').fill(password);
      await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
      await expect(page.getByText(/Usuario o contraseña incorrectos/).last()).toBeVisible();
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test('login with the admin key reaches the panel', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#username').fill('admin');
    await page.locator('#password').fill(ADMIN_KEY);
    await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('link', { name: 'Configuración' })).toBeVisible();
  });

  test('creates a professional', async ({ context }) => {
    const admin = await AdminConfigPage.open(context);
    await admin.openTab('professionals');
    await admin.createProfessional(PRO);

    const created = (await api.adminCatalog()).professionals.find((p) => p.name === PRO.name);
    expect(created).toMatchObject({ specialty: PRO.specialty, experience: PRO.experience, active: true });
    state.professionalId = created.id;
  });

  test('creates a 50 min service offered only by the new professional', async ({ context }) => {
    const admin = await AdminConfigPage.open(context);
    await admin.openTab('services');
    await admin.createService({ ...SERVICE, professionalIds: [state.professionalId] });

    const row = admin.row('service', SERVICE.name);
    await expect(row).toContainText(`${SERVICE.duration} min`);
    await expect(row).toContainText(/4[.,]?321/);
    await expect(row).toContainText(PRO.name);
    state.serviceId = (await api.adminCatalog()).services.find((s) => s.name === SERVICE.name).id;
  });

  test('public site lists the new service and professional and books a slot', async ({ page }) => {
    const booking = new BookingModal(page);
    await booking.open();

    const card = booking.serviceCard(state.serviceId);
    await expect(card).toContainText(SERVICE.name);
    await expect(card).toContainText(SERVICE.description);
    await expect(card).toContainText('50 minutos');
    await expect(card).toContainText(/4[.,]?321/);
    await expect(card).toContainText(`Profesionales: ${PRO.name}`);

    await booking.chooseService(state.serviceId);
    await expect(booking.professionalCard(state.professionalId)).toContainText(PRO.name);
    await expect(booking.professionalCard('alex-garcia')).toHaveCount(0);
    await booking.professionalCard(state.professionalId).click();
    await booking.setDate(BOOKING_DAY);

    const slots = await booking.slots();
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((time) => /^\d\d:(00|30)$/.test(time))).toBe(true); // 30-minute grid
    expect([slots[0], slots.at(-1)]).toEqual(['09:00', '19:00']); // 20:00 close minus the 2 blocks of 50 min
    expect(slots).toContain(BOOKING_TIME);

    await booking.pickTime(BOOKING_TIME);
    await booking.next();
    await booking.fillClient(CLIENT);
    await booking.confirm();
  });

  test('a booked 50 min service blocks two 30 min blocks', async ({ page }) => {
    const booking = new BookingModal(page);
    await booking.open();
    await booking.chooseService(state.serviceId);
    await booking.professionalCard(state.professionalId).click();
    await booking.setDate(BOOKING_DAY);

    const slots = await booking.slots();
    // 17:00 is taken, and so is the next block (17:30); starting at 16:30 would overlap 17:00.
    for (const taken of ['16:30', '17:00', '17:30']) expect(slots).not.toContain(taken);
    for (const free of ['09:00', '16:00', '18:00']) expect(slots).toContain(free);
  });

  test('closing Saturday and an earlier closing time reach the availability API', async ({ context }) => {
    const admin = await AdminConfigPage.open(context);
    await admin.openTab('schedule');
    await admin.page.getByTestId('schedule-closed-6').check();
    await admin.page.getByTestId('schedule-close-4').selectOption('18:00');
    await admin.saveSchedule();
    await expect(admin.page.getByText('Horarios guardados').last()).toBeVisible();

    const saturday = await api.availability(SATURDAY, state.serviceId);
    expect(saturday.closed).toBe(true);

    const slotsOf = async (date) => (await api.availability(date, state.serviceId))
      .professionals.find((p) => p.id === state.professionalId).slots;
    expect((await slotsOf(THURSDAY)).at(-1)).toBe('17:00'); // 18:00 close minus the 2 blocks of 50 min
    expect((await slotsOf(FRIDAY)).at(-1)).toBe('19:00'); // untouched day keeps the 20:00 close
  });

  test('a schedule that leaves a future booking out of hours warns with the count', async ({ context }) => {
    const admin = await AdminConfigPage.open(context);
    await admin.openTab('schedule');
    await expect(admin.page.getByTestId('schedule-closed-6')).toBeChecked(); // saved in the previous test
    await admin.page.getByTestId('schedule-close-3').selectOption('16:00'); // the booking is at 17:00
    await admin.saveSchedule();
    await expect(admin.page.getByTestId('schedule-warning')).toContainText('1 reserva futura queda fuera del nuevo horario');

    const kept = (await api.bookings()).find((b) => b.client.email === CLIENT.email);
    expect(kept).toMatchObject({ date: BOOKING_DAY, time: BOOKING_TIME });
    expect(kept.status).not.toBe('cancelled');
  });

  test('deactivating the professional hides it publicly but keeps its booking in admin', async ({ context, page }) => {
    const admin = await AdminConfigPage.open(context);
    await admin.openTab('professionals');
    await admin.page.getByTestId(`professional-toggle-${state.professionalId}`).click();
    await admin.page.getByRole('alertdialog').getByRole('button', { name: 'Desactivar' }).click();
    await expect(admin.row('professional', PRO.name)).toContainText('Inactivo');

    const booking = new BookingModal(page);
    await booking.open();
    await booking.chooseService('consulta-inicial'); // seeded service, still offered by the seeded professionals
    await expect(booking.professionalCard('alex-garcia')).toBeVisible();
    await expect(booking.professionalCard(state.professionalId)).toHaveCount(0);

    await admin.openBookings();
    await admin.page.locator('#bookings-search').fill(CLIENT.name);
    await expect(admin.page.getByRole('row').filter({ hasText: CLIENT.name })).toBeVisible();
  });

  test('admin API answers 401 without a key or with a wrong key', async ({ request }) => {
    const url = `${BACKEND_ORIGIN}/api/admin/catalog`;
    expect((await request.get(url)).status()).toBe(401);
    expect((await request.get(url, { headers: { Authorization: 'Bearer wrong-key' } })).status()).toBe(401);
    expect((await request.get(url, { headers: { Authorization: `Bearer ${ADMIN_KEY}` } })).status()).toBe(200);
  });

  test('admin API rejects out-of-range service values with 400', async ({ request }) => {
    const create = (data) => request.post(`${BACKEND_ORIGIN}/api/admin/services`, {
      headers: { Authorization: `Bearer ${ADMIN_KEY}` },
      data: { name: `E2E Invalid ${RUN}`, description: 'x', price: 10, duration: 30, professionals: ['alex-garcia'], ...data },
    });
    expect((await create({ duration: 4 })).status()).toBe(400);
    expect((await create({ duration: 481 })).status()).toBe(400);
    expect((await create({ price: -1 })).status()).toBe(400);
  });

  test('a failing public catalog shows an error and "Reintentar" recovers', async ({ page }) => {
    await page.route('**/api/catalog', (route) => route.abort());
    const booking = new BookingModal(page);
    await booking.open();

    const alert = booking.dialog.getByRole('alert');
    await expect(alert).toContainText('No pudimos cargar los servicios');

    await page.unroute('**/api/catalog');
    await alert.getByRole('button', { name: 'Reintentar' }).click();
    await expect(booking.serviceCard('consulta-inicial')).toBeVisible();
    await expect(alert).toHaveCount(0);
  });
});
