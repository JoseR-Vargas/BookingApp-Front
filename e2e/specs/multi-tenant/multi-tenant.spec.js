// SPEC 19: two businesses behind one front. A business lives under /n/<slug>, every request names it in
// X-Tenant, its admin session is its own, and its data never shows in the default business.
import { test, expect } from '../../fixtures/test.js';
import { createApi } from '../../support/api.js';
import { mongosh } from '../../support/mongo.js';
import { ADMIN_KEY, APP_BACKEND_URL, BACKEND_ORIGIN } from '../../support/env.js';

const SLUG = 'norte-e2e';
const NAME = '[TEST] Barbería Norte';
const HEADERS = { Authorization: `Bearer ${ADMIN_KEY}`, 'X-Tenant': SLUG };

let api;
let defaultBranding;

test.describe.configure({ mode: 'serial' });
test.describe('two businesses, end to end', () => {
  test.beforeAll(async () => {
    api = await createApi();
    await api.assertThrowawayDatabase();
    defaultBranding = await api.branding();
    mongosh(`db.tenants.deleteMany({ slug: '${SLUG}' }); db.tenants.insertOne({ slug: '${SLUG}', name: 'Norte', status: 'active', isDefault: false, createdAt: new Date() })`);
  });

  test.afterAll(async () => {
    const id = mongosh(`print(db.tenants.findOne({ slug: '${SLUG}' })._id.toHexString())`);
    for (const collection of ['branding', 'business_settings', 'locations', 'professionals', 'services', 'bookings']) {
      mongosh(`db.${collection}.deleteMany({ tenantId: ObjectId('${id}') })`);
    }
    mongosh(`db.tenants.deleteMany({ slug: '${SLUG}' })`);
    await api.dispose();
  });

  test('the branding of a business never shows in the default one', async ({ request }) => {
    const saved = await request.put(`${BACKEND_ORIGIN}/api/admin/branding`, {
      headers: HEADERS,
      data: { businessName: NAME, colors: defaultBranding.colors },
    });
    expect(saved.status()).toBe(200);

    const north = await request.get(`${BACKEND_ORIGIN}/api/branding`, { headers: { 'X-Tenant': SLUG } });
    expect((await north.json()).businessName).toBe(NAME);
    expect((await api.branding()).businessName).toBe(defaultBranding.businessName);
  });

  test('an unknown or suspended business answers the right status', async ({ request }) => {
    expect((await request.get(`${BACKEND_ORIGIN}/api/catalog`, { headers: { 'X-Tenant': 'no-existe' } })).status()).toBe(404);
    mongosh(`db.tenants.updateOne({ slug: '${SLUG}' }, { $set: { status: 'suspended' } })`);
    // The slug is cached for a minute: a fresh slug proves the 403 without waiting for it.
    mongosh(`db.tenants.insertOne({ slug: 'pausado-e2e', name: 'P', status: 'suspended', isDefault: false, createdAt: new Date() })`);
    const suspended = await request.get(`${BACKEND_ORIGIN}/api/catalog`, { headers: { 'X-Tenant': 'pausado-e2e' } });
    expect(suspended.status()).toBe(403);
    mongosh(`db.tenants.deleteMany({ slug: 'pausado-e2e' }); db.tenants.updateOne({ slug: '${SLUG}' }, { $set: { status: 'active' } })`);
  });

  test('the front names the business in every request, and the default business sends nothing', async ({ page }) => {
    const tenants = [];
    page.on('request', (request) => {
      if ((request.url().startsWith(APP_BACKEND_URL) || request.url().startsWith(BACKEND_ORIGIN)) && request.url().includes('/api/')) {
        tenants.push(request.headers()['x-tenant'] ?? null);
      }
    });

    await page.goto(`/n/${SLUG}`);
    await expect.poll(() => tenants.length).toBeGreaterThan(0);
    expect(new Set(tenants)).toEqual(new Set([SLUG]));

    tenants.length = 0;
    await page.goto('/');
    await expect.poll(() => tenants.length).toBeGreaterThan(0);
    expect(new Set(tenants)).toEqual(new Set([null]));
  });

  test('the admin of a business logs in under its own route and keeps its session apart', async ({ page }) => {
    await page.goto(`/n/${SLUG}/login`);
    await page.getByLabel(/usuario/i).fill('admin');
    await page.getByLabel(/contraseña/i).fill(ADMIN_KEY);
    await page.getByRole('button', { name: /Iniciar Sesión/ }).click();
    await page.waitForURL(`**/n/${SLUG}/admin`);

    const keys = await page.evaluate(() => Object.keys(sessionStorage));
    expect(keys).toContain(`adminKey:${SLUG}`);
    expect(keys).not.toContain('adminKey');

    // The default business has no session in this browser tab: its panel sends the visitor to its login.
    await page.goto('/admin');
    await page.waitForURL('**/login');
    expect(new URL(page.url()).pathname).toBe('/login');
  });

  test('an unknown business shows a notice with a link to the front page', async ({ page }) => {
    await page.goto('/n/no-existe');
    await expect(page.getByText('No encontramos este negocio. Revisa el enlace.')).toBeVisible();
    await page.getByRole('link', { name: 'Ir a la portada' }).click();
    await page.waitForURL((url) => url.pathname === '/');
  });
});
