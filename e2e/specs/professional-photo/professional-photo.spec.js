// SPEC 04, step 13: professional profile photos, end to end against the local backend + throwaway
// Mongo. The admin uploads / changes / removes photos in "Profesionales"; the public booking modal
// and the admin tables show them round. Fake data only; see e2e/support/env.js.
import { deflateSync, crc32 } from 'node:zlib';
import { test, expect } from '../../fixtures/test.js';
import { BookingModal } from '../../pages/booking/BookingModal.js';
import { AdminConfigPage } from '../../pages/admin/AdminConfigPage.js';
import { createApi } from '../../support/api.js';
import { nextWeekday } from '../../support/dates.js';
import { ADMIN_KEY, BACKEND_ORIGIN, FAKE_EMAIL_DOMAIN } from '../../support/env.js';

const RUN = Date.now().toString(36);
const HEADERS = { Authorization: `Bearer ${ADMIN_KEY}` };
const NEW_PRO = { name: `E2E Photo Pro ${RUN}`, specialty: 'E2E Specialty', experience: '2 años' };
const MESSAGE = 'La foto debe ser PNG, JPG o WebP de hasta 200 KB.';
const CLIENT = { name: `E2E Client ${RUN}`, email: `e2e+${RUN}@${FAKE_EMAIL_DOMAIN}`, phone: '+59800000000' };

/** A real, decodable PNG built with node:zlib: `pixel(x, y)` returns [r, g, b]. */
function makePng(width, height, pixel) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const base = y * (width * 3 + 1);
    for (let x = 0; x < width; x += 1) rows.set(pixel(x, y), base + 1 + x * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

// 800x400: left half red, right half blue. Its centered square (x 200..600) is half red, half blue.
const LANDSCAPE = makePng(800, 400, (x) => (x < 400 ? [220, 30, 30] : [30, 30, 220]));
const png = (buffer, name = 'foto.png') => ({ name, mimeType: 'image/png', buffer });
const photoUrlOf = async (api, id) => (await api.adminCatalog()).professionals.find((p) => p.id === id)?.photoUrl;

/** Dimensions and the colors at the left and right of an image served by the backend, decoded in the browser. */
async function inspectPhoto(page, response) {
  const base64 = Buffer.from(await response.body()).toString('base64');
  return page.evaluate(async ({ data, type }) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    const at = (x) => Array.from(context.getImageData(x, bitmap.height / 2, 1, 1).data).slice(0, 3);
    return { width: bitmap.width, height: bitmap.height, left: at(20), right: at(bitmap.width - 20), bytes: bytes.length };
  }, { data: base64, type: response.headers()['content-type'] });
}

let api;
const state = {};

test.describe.configure({ mode: 'serial' });

test.describe('professional photos, end to end', () => {
  test.beforeAll(async () => {
    api = await createApi();
    await api.assertThrowawayDatabase();
    await api.cleanup();
    // Earlier aborted runs may have left a photo on the seeded professionals.
    for (const id of ['alex-garcia', 'maria-lopez']) await api.ctx.delete(`/api/admin/professionals/${id}/photo`, { headers: HEADERS });
  });

  test.afterAll(async () => {
    for (const id of ['alex-garcia', 'maria-lopez']) await api.ctx.delete(`/api/admin/professionals/${id}/photo`, { headers: HEADERS });
    await api.cleanup({ professionalId: state.proId });
    await api.dispose();
  });

  test('the API: public photo, key-protected writes, strict validation, atomic create', async ({ request }) => {
    const created = await request.post(`${BACKEND_ORIGIN}/api/admin/professionals`, { headers: HEADERS, data: NEW_PRO });
    expect(created.status()).toBe(201);
    const professional = await created.json();
    state.apiProId = professional.id;
    expect(professional.photoUrl).toBeNull();
    expect((await request.get(`${BACKEND_ORIGIN}/api/catalog/professionals/${professional.id}/photo`)).status()).toBe(404);

    const photoRoute = `${BACKEND_ORIGIN}/api/admin/professionals/${professional.id}/photo`;
    expect((await request.put(photoRoute, { data: {} })).status()).toBe(401);
    expect((await request.delete(photoRoute)).status()).toBe(401);
    expect((await request.put(`${BACKEND_ORIGIN}/api/admin/professionals/no-existe/photo`, { headers: HEADERS, data: { dataUrl: `data:image/png;base64,${makePng(2, 2, () => [0, 0, 0]).toString('base64')}` } })).status()).toBe(404);

    const dataUrl = (type, body) => `data:${type};base64,${body.toString('base64')}`;
    const tinyPng = makePng(4, 4, () => [10, 20, 30]);
    for (const [label, value] of [
      ['oversized', dataUrl('image/png', Buffer.concat([tinyPng, Buffer.alloc(201 * 1024)]))],
      ['svg', dataUrl('image/svg+xml', Buffer.from('<svg/>'))],
      ['not an image', dataUrl('image/jpeg', Buffer.from('definitely not a jpeg'))],
      ['wrong declared type', dataUrl('image/webp', tinyPng)],
    ]) {
      const bad = await request.put(photoRoute, { headers: HEADERS, data: { dataUrl: value } });
      expect(bad.status(), label).toBe(400);
      expect((await bad.json()).message, label).toBe(MESSAGE);
    }
    expect(await photoUrlOf(api, professional.id)).toBeNull();

    const ok = await request.put(photoRoute, { headers: HEADERS, data: { dataUrl: dataUrl('image/png', tinyPng) } });
    expect(ok.status()).toBe(200);
    const withPhoto = await ok.json();
    expect(withPhoto.photoUrl).toMatch(new RegExp(`^/api/catalog/professionals/${professional.id}/photo\\?v=\\d+$`));
    expect((await api.adminCatalog()).professionals.find((p) => p.id === professional.id).photoUrl).toBe(withPhoto.photoUrl);
    expect(JSON.stringify(await api.adminCatalog())).not.toContain(tinyPng.toString('base64'));

    const served = await request.get(`${BACKEND_ORIGIN}${withPhoto.photoUrl}`);
    expect(served.status()).toBe(200);
    expect(served.headers()['content-type']).toBe('image/png');
    expect(served.headers()['cache-control']).toContain('max-age=86400');
    expect(Buffer.compare(await served.body(), tinyPng)).toBe(0);
    const publicCatalog = await (await request.get(`${BACKEND_ORIGIN}/api/catalog`)).json();
    expect(publicCatalog.professionals.find((p) => p.id === professional.id).photoUrl).toBe(withPhoto.photoUrl);

    // PATCH never touches the photo, and a deactivated professional keeps serving it.
    const patched = await request.patch(`${BACKEND_ORIGIN}/api/admin/professionals/${professional.id}`, {
      headers: HEADERS,
      data: { specialty: 'Changed', photoDataUrl: dataUrl('image/png', makePng(2, 2, () => [1, 1, 1])), photo: 'x' },
    });
    expect((await patched.json()).photoUrl).toBe(withPhoto.photoUrl);
    await request.delete(`${BACKEND_ORIGIN}/api/admin/professionals/${professional.id}`, { headers: HEADERS });
    expect((await request.get(`${BACKEND_ORIGIN}${withPhoto.photoUrl}`)).status()).toBe(200);

    const removed = await request.delete(photoRoute, { headers: HEADERS });
    expect((await removed.json())).toMatchObject({ photoUrl: null, active: false });
    expect((await request.get(`${BACKEND_ORIGIN}/api/catalog/professionals/${professional.id}/photo`)).status()).toBe(404);

    // Creating with an invalid photo creates nothing; with a valid one it stores both at once.
    const before = (await api.adminCatalog()).professionals.length;
    const rejected = await request.post(`${BACKEND_ORIGIN}/api/admin/professionals`, {
      headers: HEADERS,
      data: { ...NEW_PRO, name: `${NEW_PRO.name} rejected`, photoDataUrl: dataUrl('image/svg+xml', Buffer.from('<svg/>')) },
    });
    expect(rejected.status()).toBe(400);
    expect((await api.adminCatalog()).professionals).toHaveLength(before);
    const atomic = await request.post(`${BACKEND_ORIGIN}/api/admin/professionals`, {
      headers: HEADERS,
      data: { ...NEW_PRO, name: `${NEW_PRO.name} atomic`, photoDataUrl: dataUrl('image/png', tinyPng) },
    });
    expect(atomic.status()).toBe(201);
    state.atomicId = (await atomic.json()).id;
    expect(await photoUrlOf(api, state.atomicId)).not.toBeNull();
  });

  test('the form creates a professional with a cropped 256x256 photo, previewed round before saving', async ({ context }) => {
    const admin = await AdminConfigPage.open(context);
    const { page } = admin;
    await admin.openTab('professionals');
    await page.getByRole('button', { name: 'Nuevo profesional' }).click();
    await page.getByTestId('professional-name-input').fill(`${NEW_PRO.name} UI`);

    await page.getByTestId('professional-photo-input').setInputFiles(png(LANDSCAPE));
    const preview = page.getByTestId('professional-photo-preview').locator('img');
    await expect(preview).toBeVisible();
    const box = await preview.boundingBox();
    expect(Math.round(box.width)).toBe(Math.round(box.height));
    expect(await preview.evaluate((node) => getComputedStyle(node).borderRadius)).not.toBe('0px');

    await page.getByTestId('professional-save').click();
    const row = admin.row('professional', `${NEW_PRO.name} UI`);
    await expect(row.locator('img')).toBeVisible();

    const created = (await api.adminCatalog()).professionals.find((p) => p.name === `${NEW_PRO.name} UI`);
    state.proId = created.id;
    expect(created.photoUrl).toMatch(/\?v=\d+$/);
    const photo = await inspectPhoto(page, await api.ctx.get(created.photoUrl));
    expect([photo.width, photo.height]).toEqual([256, 256]);
    expect(photo.bytes).toBeLessThan(200 * 1024);
    // The centered square of the 800x400 image is half red, half blue.
    expect(photo.left[0]).toBeGreaterThan(photo.left[2]);
    expect(photo.right[2]).toBeGreaterThan(photo.right[0]);
  });

  test('a professional can be created without a photo; bad files are rejected before any request', async ({ context }) => {
    const admin = await AdminConfigPage.open(context);
    const { page } = admin;
    await admin.openTab('professionals');
    await page.getByRole('button', { name: 'Nuevo profesional' }).click();
    const requests = [];
    page.on('request', (request) => { if (request.method() !== 'GET') requests.push(`${request.method()} ${request.url()}`); });

    const input = page.getByTestId('professional-photo-input');
    const error = page.getByTestId('professional-photo-error');
    await input.setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
    await expect(error).toHaveText('La foto debe ser PNG, JPG o WebP de hasta 10 MB.');
    await input.setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
    await expect(error).toHaveText('La foto debe ser PNG, JPG o WebP de hasta 10 MB.');
    await input.setInputFiles(png(Buffer.from('this is not really a png'), 'broken.png'));
    await expect(error).toHaveText('No pudimos leer la imagen. Usa un PNG, JPG o WebP.');
    expect(requests).toEqual([]);
    await expect(page.getByTestId('professional-photo-preview').locator('img')).toHaveCount(0);

    await page.getByTestId('professional-name-input').fill(`${NEW_PRO.name} plain`);
    await page.getByTestId('professional-save').click();
    const row = admin.row('professional', `${NEW_PRO.name} plain`);
    await expect(row).toBeVisible();
    await expect(row.locator('img')).toHaveCount(0);
    await expect(row).toContainText('E2'); // initials of "E2E Photo Pro ..."
    expect((await api.adminCatalog()).professionals.find((p) => p.name === `${NEW_PRO.name} plain`).photoUrl).toBeNull();
  });

  test('editing changes the photo; the booking modal and the bookings table show it round', async ({ context }) => {
    const admin = await AdminConfigPage.open(context);
    const { page } = admin;
    await admin.openTab('professionals');
    await page.getByTestId('professional-edit-alex-garcia').click();
    await expect(page.getByTestId('professional-photo-preview').locator('img')).toHaveCount(0);
    await page.getByTestId('professional-photo-input').setInputFiles(png(LANDSCAPE));
    await expect(page.getByTestId('professional-photo-preview').locator('img')).toBeVisible();
    await page.getByTestId('professional-save').click();
    await expect(admin.row('professional', 'Alex García').locator('img')).toBeVisible();
    const alexUrl = await photoUrlOf(api, 'alex-garcia');
    expect(alexUrl).not.toBeNull();

    // Public booking modal: Alex shows the round photo, María the initials; the cards keep one height.
    const booking = new BookingModal(page);
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await booking.open();
      await booking.chooseService('consulta-inicial');
      const alex = booking.professionalCard('alex-garcia');
      const maria = booking.professionalCard('maria-lopez');
      await expect(alex.locator('img')).toBeVisible();
      await expect(maria.locator('img')).toHaveCount(0);
      await expect(maria).toContainText('ML');
      const image = await alex.locator('img').boundingBox();
      expect(Math.round(image.width), `${viewport.width}px`).toBe(Math.round(image.height));
      expect(await alex.locator('img').evaluate((node) => getComputedStyle(node).borderTopLeftRadius)).not.toBe('0px');
      const [alexBox, mariaBox] = [await alex.boundingBox(), await maria.boundingBox()];
      expect(Math.abs(alexBox.height - mariaBox.height), `${viewport.width}px card heights`).toBeLessThanOrEqual(1);
    }
    await page.setViewportSize({ width: 1440, height: 900 });

    // Admin bookings table: a booking of Alex shows his photo; one of María shows her initials.
    const day = nextWeekday(3);
    await api.createBooking({ client: CLIENT, date: day, time: '10:00' });
    await api.createBooking({ client: { ...CLIENT, email: `e2e2+${RUN}@${FAKE_EMAIL_DOMAIN}` }, date: day, time: '11:00', professionalId: 'maria-lopez' });
    // The first tab navigated to the public site: open a fresh admin tab for the table.
    const panel = await AdminConfigPage.open(context);
    await panel.openBookings();
    const rowOf = (email) => panel.page.getByRole('row').filter({ hasText: email });
    await expect(rowOf(CLIENT.email).locator('img')).toBeVisible();
    await expect(rowOf(`e2e2+${RUN}@${FAKE_EMAIL_DOMAIN}`).locator('img')).toHaveCount(0);
    await expect(rowOf(`e2e2+${RUN}@${FAKE_EMAIL_DOMAIN}`)).toContainText('ML');
  });

  test('"Quitar foto" removes it on save and every screen falls back to the initials', async ({ context }) => {
    const admin = await AdminConfigPage.open(context);
    const { page } = admin;
    await admin.openTab('professionals');
    await page.getByTestId('professional-edit-alex-garcia').click();
    await expect(page.getByTestId('professional-photo-preview').locator('img')).toBeVisible();
    await page.getByRole('button', { name: 'Quitar foto' }).click();
    // Nothing is deleted until saving.
    expect(await photoUrlOf(api, 'alex-garcia')).not.toBeNull();
    await page.getByTestId('professional-save').click();
    await expect(admin.row('professional', 'Alex García').locator('img')).toHaveCount(0);
    expect(await photoUrlOf(api, 'alex-garcia')).toBeNull();
    await expect(admin.row('professional', 'Alex García')).toContainText('AG');
    expect((await api.ctx.get('/api/catalog/professionals/alex-garcia/photo')).status()).toBe(404);
  });

  test('a photo that fails to load shows the initials, not a broken image', async ({ context }) => {
    const admin = await AdminConfigPage.open(context);
    const { page } = admin;
    await admin.openTab('professionals');
    await page.getByTestId('professional-edit-alex-garcia').click();
    await page.getByTestId('professional-photo-input').setInputFiles(png(LANDSCAPE));
    await page.getByTestId('professional-save').click();
    await expect(admin.row('professional', 'Alex García').locator('img')).toBeVisible();

    await page.route('**/api/catalog/professionals/*/photo*', (route) => route.abort());
    await page.reload();
    await admin.openTab('professionals');
    await expect(admin.row('professional', 'Alex García').locator('img')).toHaveCount(0);
    await expect(admin.row('professional', 'Alex García')).toContainText('AG');
  });
});
