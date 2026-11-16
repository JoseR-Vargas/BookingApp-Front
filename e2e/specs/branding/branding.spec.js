// SPEC 03, step 16: edit colors, business name and logo in the admin and publish them to the whole app,
// against the local backend + throwaway Mongo. The branding document is reset after the run.
import { test, expect } from '../../fixtures/test.js';
import { AdminConfigPage } from '../../pages/admin/AdminConfigPage.js';
import { createApi } from '../../support/api.js';
import { ADMIN_KEY, BACKEND_ORIGIN } from '../../support/env.js';

const DEFAULT_COLORS = { accent: '#f62039', background: '#f9f2f2', text: '#111111', accentSecondary: '#295294' };
const BRAND = {
  businessName: '[TEST] Barbería Don Pepe',
  colors: { accent: '#3366cc', background: '#ffffff', text: '#1a1a1a', accentSecondary: '#224488' },
};
const HEADERS = { Authorization: `Bearer ${ADMIN_KEY}` };
// A real PNG (magic bytes checked by the backend); no logo from any user's files.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLzcwAAAABJRU5ErkJggg==', 'base64');

const hex = (page, field) => page.getByLabel(`${field} (hexadecimal)`);
const rootVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name);

let api;

test.describe.configure({ mode: 'serial' });
test.describe('branding by admin, end to end', () => {
  test.beforeAll(async () => {
    api = await createApi();
    await api.assertThrowawayDatabase();
    await api.resetBranding();
  });

  test.beforeEach(async () => {
    await api.resetBranding();
  });

  test.afterAll(async () => {
    await api.resetBranding();
    await api.dispose();
  });

  test('public reads do not need a key; every write and every invalid branding is rejected', async ({ request }) => {
    const branding = await request.get(`${BACKEND_ORIGIN}/api/branding`);
    expect(branding.ok()).toBe(true);
    expect(await branding.json()).toMatchObject({ businessName: null, colors: DEFAULT_COLORS, logoUrl: null });
    expect((await request.get(`${BACKEND_ORIGIN}/api/branding/logo`)).status()).toBe(404);

    for (const [method, path] of [['put', '/api/admin/branding'], ['put', '/api/admin/branding/logo'], ['delete', '/api/admin/branding/logo']]) {
      expect((await request[method](`${BACKEND_ORIGIN}${path}`, { data: {} })).status()).toBe(401);
    }

    const send = (data) => request.put(`${BACKEND_ORIGIN}/api/admin/branding`, { headers: HEADERS, data });
    const cases = [
      [{ businessName: null, colors: { background: '#0d0d0d', text: '#f5f0e8', accentSecondary: null } }, 400],
      [{ businessName: null, colors: { ...DEFAULT_COLORS, accent: 'gold' } }, 400],
      [{ businessName: null, colors: { accent: '#000000', background: '#888888', text: '#777777', accentSecondary: null } }, 400],
      [{ businessName: 'x'.repeat(61), colors: DEFAULT_COLORS }, 400],
      [{ businessName: '   ', colors: DEFAULT_COLORS }, 200],
      [{ businessName: null, colors: { ...DEFAULT_COLORS, accentSecondary: null } }, 200],
      [{ businessName: null, colors: { ...DEFAULT_COLORS, accentSecondary: DEFAULT_COLORS.background } }, 400],
    ];
    for (const [data, status] of cases) {
      const response = await send(data);
      expect(response.status(), await response.text()).toBe(status);
    }
    expect((await send({ businessName: null, colors: DEFAULT_COLORS })).status()).toBe(200);

    for (const [name, type, body] of [
      ['oversized', 'image/png', Buffer.alloc(201 * 1024, 0)],
      ['svg', 'image/svg+xml', Buffer.from('<svg/>')],
      ['fake-png', 'image/png', Buffer.from('<svg/>')],
    ]) {
      const response = await request.put(`${BACKEND_ORIGIN}/api/admin/branding/logo`, {
        headers: HEADERS,
        data: { dataUrl: `data:${type};base64,${body.toString('base64')}` },
      });
      expect(response.status(), name).toBe(400);
    }
  });

  test('the editor previews colors, rejects low contrast and publishes name, colors and logo', async ({ context }) => {
    const admin = await AdminConfigPage.open(context);
    const page = admin.page;
    await admin.openTab('branding');
    await admin.openTab('branding');

    await hex(page, 'Acento').fill(BRAND.colors.accent);
    await expect.poll(() => admin.page.evaluate(rootVar, '--brand-accent')).toBe(BRAND.colors.accent);
    await hex(page, 'Fondo').fill('#888888');
    await hex(page, 'Texto').fill('#777777');
    await hex(page, 'Acento').fill('#000000');
    await expect(page.getByText('El texto no contrasta lo suficiente con el fondo (mínimo 4.5:1).')).toBeVisible();
    await expect(page.getByTestId('branding-save')).toBeDisabled();

    await hex(page, 'Fondo').fill(BRAND.colors.background);
    await hex(page, 'Texto').fill(BRAND.colors.text);
    await hex(page, 'Acento').fill(BRAND.colors.accent);
    await page.getByLabel('Usar acento secundario').check();
    await hex(page, 'Acento secundario').fill(BRAND.colors.accentSecondary);
    await page.getByLabel('Nombre del negocio').fill(BRAND.businessName);

    // Rejecting a bad file in the panel never sends it to the API.
    await page.getByTestId('branding-logo').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
    await expect(page.getByTestId('branding-logo-error')).toHaveText('El logo debe ser PNG, JPG o WebP de hasta 200 KB.');
    await page.getByTestId('branding-logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByRole('img', { name: 'Logo actual' })).toBeVisible();

    await page.getByTestId('branding-save').click();
    await expect(page.getByText('Marca guardada')).toBeVisible();

    await page.goto('/');
    await expect(page.locator('#hero-heading')).toHaveText(BRAND.businessName);
    await expect(page.locator('header img[alt="[TEST] Barbería Don Pepe"]')).toBeVisible();
    expect(await page.evaluate(rootVar, '--brand-bg')).toBe('#ffffff');
    await page.reload({ waitUntil: 'domcontentloaded' });
    // Before even waiting for the API, index.html restored the cache: no gold flash.
    expect(await page.evaluate(rootVar, '--brand-accent')).toBe(BRAND.colors.accent);
    await expect(page.locator('footer img[alt="[TEST] Barbería Don Pepe"]')).toBeVisible();

    const again = await AdminConfigPage.open(context);
    await again.openTab('branding');
    const panel = again.page;
    await expect(hex(panel, 'Acento')).toHaveValue(BRAND.colors.accent);
    await panel.getByRole('button', { name: 'Restaurar colores originales' }).click();
    await expect(hex(panel, 'Acento')).toHaveValue(DEFAULT_COLORS.accent);
    await expect(hex(panel, 'Fondo')).toHaveValue(DEFAULT_COLORS.background);
    await expect(hex(panel, 'Texto')).toHaveValue(DEFAULT_COLORS.text);
    await panel.getByRole('button', { name: 'Quitar logo' }).click();
    await expect(panel.getByText('Logo eliminado')).toBeVisible();
    await panel.getByTestId('branding-save').click();
    await expect(panel.getByText('Marca guardada')).toBeVisible();

    const saved = await api.branding();
    expect(saved).toMatchObject({ businessName: BRAND.businessName, colors: DEFAULT_COLORS, logoUrl: null });
  });
});

