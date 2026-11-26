// SPEC 25: the owner of the system sees every business with its signals, can suspend it and bring it back,
// and the public SaaS site shows the plans and the sign-up.
import { test, expect } from '../../fixtures/test.js';
import { mongosh } from '../../support/mongo.js';
import { BACKEND_ORIGIN, FAKE_EMAIL_DOMAIN } from '../../support/env.js';

const KEY = { 'x-platform-key': 'e2e-platform-key' };
const SLUG = 'panel-e2e';
const PASSWORD = 'e2e-password-123';

function purge() {
  const found = mongosh(`const t = db.tenants.findOne({ slug: '${SLUG}' }); print(t ? t._id.toHexString() : '')`);
  if (!found) return;
  for (const c of ['branding', 'business_settings', 'locations', 'professionals', 'services', 'bookings', 'admin_users', 'admin_sessions', 'subscriptions']) {
    mongosh(`db.${c}.deleteMany({ tenantId: ObjectId('${found}') })`);
  }
  mongosh(`db.tenants.deleteMany({ slug: '${SLUG}' })`);
}

test.describe.configure({ mode: 'serial' });
test.describe('the panel of the owner of the system, end to end', () => {
  test.beforeAll(purge);
  test.afterAll(purge);

  test('the platform key is needed, and the admin key of a business is not enough', async ({ request }) => {
    expect((await request.get(`${BACKEND_ORIGIN}/api/platform/tenants`)).status()).toBe(401);
    expect((await request.get(`${BACKEND_ORIGIN}/api/platform/tenants`, { headers: { Authorization: 'Bearer e2e-test-admin-key' } })).status()).toBe(401);
    expect((await request.get(`${BACKEND_ORIGIN}/api/platform/tenants`, { headers: KEY })).status()).toBe(200);
  });

  test('the list shows every business with its signals', async ({ request }) => {
    await request.post(`${BACKEND_ORIGIN}/api/signup`, {
      data: {
        businessName: '[TEST] Panel E2E', adminName: 'Ana', email: `panel@${FAKE_EMAIL_DOMAIN}`,
        password: PASSWORD, slug: SLUG,
      },
    });
    const body = JSON.parse(await (await request.get(`${BACKEND_ORIGIN}/api/platform/tenants`, { headers: KEY })).text());
    const found = body.businesses.find((one) => one.slug === SLUG);
    expect(found).toBeDefined();
    expect(found.name).toBe('[TEST] Panel E2E');
    expect(found.status).toBe('active');
    expect(found.trial).not.toBeNull();
    expect(found.bookingsThisMonth).toBe(0);
  });

  test('the metrics of the platform are answered', async ({ request }) => {
    const metrics = JSON.parse(await (await request.get(`${BACKEND_ORIGIN}/api/platform/metrics`, { headers: KEY })).text());
    expect(metrics.businesses.total).toBeGreaterThan(0);
    expect(metrics.bookings).toHaveProperty('today');
    expect(metrics.bookings).toHaveProperty('thisMonth');
  });

  test('suspending a business makes its own routes answer 403 and brings it back', async ({ request }) => {
    const list = JSON.parse(await (await request.get(`${BACKEND_ORIGIN}/api/platform/tenants`, { headers: KEY })).text());
    const id = list.businesses.find((one) => one.slug === SLUG).id;

    expect((await request.post(`${BACKEND_ORIGIN}/api/platform/tenants/${id}/suspend`, { headers: KEY })).status()).toBe(200);
    const suspended = await request.get(`${BACKEND_ORIGIN}/api/catalog`, { headers: { 'X-Tenant': SLUG } });
    expect(suspended.status()).toBe(403);
    expect((await suspended.text()).length).toBeGreaterThan(0);
    // Nothing was deleted.
    expect(mongosh(`print(db.tenants.findOne({ slug: '${SLUG}' }) ? 1 : 0)`)).toBe('1');

    expect((await request.post(`${BACKEND_ORIGIN}/api/platform/tenants/${id}/reactivate`, { headers: KEY })).status()).toBe(200);
    expect((await request.get(`${BACKEND_ORIGIN}/api/catalog`, { headers: { 'X-Tenant': SLUG } })).status()).toBe(200);
  });

  test('the public SaaS site shows the plans and the way to start', async ({ page }) => {
    await page.goto('/saas');
    await expect(page.getByRole('heading', { name: 'Planes' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Gratis' })).toBeVisible();
    await expect(page.getByText('19 USD/mes')).toBeVisible();
    await page.getByRole('link', { name: 'Empezar' }).first().click();
    await expect(page).toHaveURL(/\/empezar$/);
    await expect(page.getByRole('button', { name: 'Crear mi negocio' })).toBeVisible();
  });
});
