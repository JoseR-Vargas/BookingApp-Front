// SPEC 21: someone creates a business by themselves, configures it and takes a booking; the free trial warns and
// then blocks new bookings. Every business created here is removed afterwards.
import { test, expect } from '../../fixtures/test.js';
import { mongosh } from '../../support/mongo.js';
import { nextWeekday } from '../../support/dates.js';
import { BACKEND_ORIGIN, FAKE_EMAIL_DOMAIN } from '../../support/env.js';

const UI_SLUG = 'alta-ui-e2e';
const API_SLUG = 'alta-api-e2e';
const PASSWORD = 'e2e-password-123';
const SLUGS = [UI_SLUG, API_SLUG];

function purge() {
  for (const slug of SLUGS) {
    const found = mongosh(`const t = db.tenants.findOne({ slug: '${slug}' }); print(t ? t._id.toHexString() : '')`);
    if (!found) continue;
    for (const collection of ['branding', 'business_settings', 'locations', 'professionals', 'services', 'bookings', 'admin_users', 'admin_sessions']) {
      mongosh(`db.${collection}.deleteMany({ tenantId: ObjectId('${found}') })`);
    }
    mongosh(`db.tenants.deleteMany({ slug: '${slug}' })`);
  }
}

const signup = (request, slug) => request.post(`${BACKEND_ORIGIN}/api/signup`, {
  data: { businessName: `[TEST] ${slug}`, adminName: 'Admin', email: `${slug}@${FAKE_EMAIL_DOMAIN}`, password: PASSWORD, slug },
});

test.describe.configure({ mode: 'serial' });
test.describe('business sign-up, end to end', () => {
  test.beforeAll(purge);
  test.afterAll(purge);

  test('a visitor creates a business, lands in the wizard and sees the trial in the panel', async ({ page }) => {
    await page.goto('/empezar');
    await page.getByLabel('Nombre del negocio').fill('[TEST] Alta UI');
    await page.getByLabel('Dirección de tu negocio').fill(UI_SLUG);
    await page.getByLabel('Tu nombre').fill('Ana');
    await page.getByLabel('Correo').fill(`ana@${FAKE_EMAIL_DOMAIN}`);
    await page.getByLabel(/Contraseña/).fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear mi negocio' }).click();

    await page.waitForURL(`**/n/${UI_SLUG}/asistente`);
    await expect(page.getByRole('heading', { name: 'Tus servicios' })).toBeVisible();
    // Every step can be skipped and revisited.
    await page.getByRole('button', { name: 'Saltar' }).click();
    await expect(page.getByRole('heading', { name: 'Tu equipo' })).toBeVisible();
    await page.getByRole('button', { name: 'Atrás' }).click();
    await expect(page.getByRole('heading', { name: 'Tus servicios' })).toBeVisible();

    await page.getByRole('link', { name: 'Ir al panel' }).click();
    await page.waitForURL(`**/n/${UI_SLUG}/admin`);
    await expect(page.getByTestId('trial-banner')).toContainText('te quedan 14 días y 0 de 20 reservas');
  });

  test('the new business is isolated, and a repeated or reserved address is rejected', async ({ request }) => {
    const again = await signup(request, UI_SLUG);
    expect(again.status()).toBe(409);
    const reserved = await signup(request, 'admin');
    expect(reserved.status()).toBe(400);
    const catalog = await (await request.get(`${BACKEND_ORIGIN}/api/catalog`, { headers: { 'X-Tenant': UI_SLUG } })).json();
    expect(catalog.professionals).toEqual([]);
    expect(catalog.services).toEqual([]);
  });

  test('the trial lets the quota of bookings in and then blocks the next one with 403', async ({ request }) => {
    expect((await signup(request, API_SLUG)).status()).toBe(201);
    // Fresh business: its record is not cached yet, so the quota change is read by the next request.
    mongosh(`db.tenants.updateOne({ slug: '${API_SLUG}' }, { $set: { bookingQuota: 1 } })`);
    const as = { 'X-Tenant': API_SLUG };

    const professional = await (await request.post(`${BACKEND_ORIGIN}/api/admin/professionals`, {
      headers: as, data: { name: 'Pro Alta', specialty: 'Barber', experience: '5 años' },
    })).json();
    const service = await (await request.post(`${BACKEND_ORIGIN}/api/admin/services`, {
      headers: as, data: { name: 'Corte Alta', description: 'x', price: 10, duration: 30, professionals: [professional.id] },
    })).json();

    const book = (time, n) => request.post(`${BACKEND_ORIGIN}/api/bookings`, {
      headers: as,
      data: {
        client: { name: `Cliente ${n}`, email: `c${n}@${FAKE_EMAIL_DOMAIN}`, phone: '3001234567' },
        date: nextWeekday(2), time, services: [{ id: service.id }], professional: { id: professional.id, name: 'x' },
      },
    });

    expect((await book('10:00', 1)).status()).toBe(201);
    const blocked = await book('11:00', 2);
    expect(blocked.status()).toBe(403);
    expect((await blocked.json()).message).toBe('Este negocio alcanzó el límite de su prueba.');

    // The panel keeps working and says why.
    const session = await (await request.get(`${BACKEND_ORIGIN}/api/admin/session`, { headers: as })).json();
    expect(session.ok).toBe(true);
    const catalog = await request.get(`${BACKEND_ORIGIN}/api/catalog`, { headers: as });
    expect(catalog.status()).toBe(200);
  });
});
