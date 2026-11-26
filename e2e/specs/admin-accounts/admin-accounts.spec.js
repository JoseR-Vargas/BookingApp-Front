// SPEC 20: accounts with roles. The owner of a business creates a staff and a viewer; each one logs in with
// email and password (cookie session) and sees only what its role allows. A deactivated account cannot enter.
import { test, expect } from '../../fixtures/test.js';
import { createApi } from '../../support/api.js';
import { nextWeekday } from '../../support/dates.js';
import { mongosh } from '../../support/mongo.js';
import { ADMIN_KEY, BACKEND_ORIGIN, FAKE_EMAIL_DOMAIN } from '../../support/env.js';

const KEY = { Authorization: `Bearer ${ADMIN_KEY}` };
const PASSWORD = 'e2e-password-123';
const account = (name, role) => ({ name, role, email: `${name.toLowerCase()}@${FAKE_EMAIL_DOMAIN}`, password: PASSWORD });
const STAFF = account('Staff', 'staff');
const VIEWER = account('Viewer', 'viewer');
const OWNER = account('Owner', 'owner');

let api;
let bookingId;

async function login(page, { email, password = PASSWORD }) {
  await page.goto('/login');
  await page.locator('#username').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
}

test.describe.configure({ mode: 'serial' });
test.describe('admin accounts and roles, end to end', () => {
  test.beforeAll(async () => {
    api = await createApi();
    await api.assertThrowawayDatabase();
    mongosh("db.admin_users.deleteMany({ email: /@example.invalid$/ }); db.admin_sessions.deleteMany({})");
    for (const user of [OWNER, STAFF, VIEWER]) {
      const created = await api.ctx.post('/api/admin/users', { headers: KEY, data: user });
      expect(created.status()).toBe(201);
    }
    const booking = await api.createBooking({
      client: { name: 'Cliente Roles', email: `roles@${FAKE_EMAIL_DOMAIN}`, phone: '3001234567' },
      date: nextWeekday(3),
      time: '13:00',
    });
    bookingId = booking._id ?? booking.id;
  });

  test.afterAll(async () => {
    mongosh("db.admin_users.deleteMany({ email: /@example.invalid$/ }); db.admin_sessions.deleteMany({})");
    await api.cleanup();
    await api.dispose();
  });

  test('the owner logs in with email and password and sees the configuration and the users', async ({ page }) => {
    await login(page, OWNER);
    await expect(page).toHaveURL(/\/admin$/);
    // The session is a cookie: the key never reaches the browser storage.
    expect(await page.evaluate(() => sessionStorage.getItem('adminKey'))).toBeNull();
    await page.getByRole('link', { name: /Configuración/ }).click();
    await page.getByTestId('config-tab-users').click();
    await expect(page.getByText(STAFF.email)).toBeVisible();
    await expect(page.getByText(VIEWER.email)).toBeVisible();
  });

  test('staff does not see the configuration and the backend refuses it', async ({ page }) => {
    await login(page, STAFF);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('link', { name: /Configuración/ })).toHaveCount(0);
    const response = await page.request.post(`${BACKEND_ORIGIN}/api/admin/services`, { data: {} });
    expect(response.status()).toBe(403);
  });

  test('a viewer reads the bookings but cannot delete or cancel them', async ({ page }) => {
    await login(page, VIEWER);
    await expect(page).toHaveURL(/\/admin$/);
    await page.getByRole('link', { name: /Reservas/ }).click();
    await expect(page.getByText('Cliente Roles')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Eliminar reserva' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cancelar reserva' })).toHaveCount(0);
    const denied = await page.request.delete(`${BACKEND_ORIGIN}/api/bookings/${bookingId}`);
    expect(denied.status()).toBe(403);
  });

  test('a wrong password and a deactivated account get the same generic error', async ({ page }) => {
    await login(page, { email: STAFF.email, password: 'wrong-password-1' });
    await expect(page.getByText(/Usuario o contraseña incorrectos/)).toBeVisible();

    const users = await (await api.ctx.get('/api/admin/users', { headers: KEY })).json();
    const staff = users.find((user) => user.email === STAFF.email);
    expect((await api.ctx.post(`/api/admin/users/${staff.id}/deactivate`, { headers: KEY })).status()).toBe(201);

    await login(page, STAFF);
    await expect(page.getByText(/Usuario o contraseña incorrectos/)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});
