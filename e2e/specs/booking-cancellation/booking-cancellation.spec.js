// Spec 02 (booking-cancellation), step 13: a client cancels from a link, the admin cancels from the panel,
// and the admin routes are protected, end to end against the local backend + throwaway Mongo. Fake data
// only; see e2e/support/env.js. One serial flow: later tests reuse the bookings created by earlier ones.
//
// The server clock is the real clock, so only the two sides of the cutoff that are far from it are driven
// here (a booking next week: cancellable; a booking in 2020: closed). The exact +-1 s boundary is covered
// by the backend unit tests.
import { createHash } from 'node:crypto';
import { test, expect } from '../../fixtures/test.js';
import { BookingModal } from '../../pages/booking/BookingModal.js';
import { CancelPage } from '../../pages/booking/CancelPage.js';
import { AdminBookingsPage } from '../../pages/admin/AdminBookingsPage.js';
import { createApi } from '../../support/api.js';
import { longDateEs, nextWeekday, PAST_MONDAY } from '../../support/dates.js';
import { ADMIN_KEY, FAKE_EMAIL_DOMAIN } from '../../support/env.js';
import { mongosh, throwawayDatabaseNames } from '../../support/mongo.js';

const RUN = Date.now().toString(36);
const fakeClient = (label) => ({
  name: `E2E Cancel ${label} ${RUN}`,
  email: `e2e-cancel-${label}-${RUN}@${FAKE_EMAIL_DOMAIN}`,
  phone: '+59800000000',
});
const UI_CLIENT = fakeClient('ui');
const PAST_CLIENT = fakeClient('past');
const API_CLIENT = fakeClient('api');
const LIVE_CLIENT = fakeClient('live');

const SERVICE = { id: 'consulta-inicial', name: 'Consulta Inicial' };
const PROFESSIONAL = { id: 'alex-garcia', name: 'Alex García' };
const DAY = nextWeekday(2); // Tuesday, a week or more ahead: always before the cutoff
const UI_TIME = '11:00';
const API_TIME = '15:00';
const LIVE_TIME = '16:00';
const PAST_TIME = '10:00';

const WELL_FORMED_UNKNOWN_TOKEN = 'A'.repeat(43);
const slotsOf = async (api, date) => (await api.availability(date, SERVICE.id))
  .professionals.find((p) => p.id === PROFESSIONAL.id).slots;
const adminHeaders = { Authorization: `Bearer ${ADMIN_KEY}` };

const state = {}; // what the flow creates: token, ids
let api;

test.describe.configure({ mode: 'serial' });

test.describe('booking cancellation, end to end', () => {
  test.beforeAll(async () => {
    api = await createApi();
    // Safety proof, before any write: the backend serves the seeded throwaway catalog, holds only fake
    // bookings, and the Mongo container the suite talks to is the throwaway one.
    await api.assertThrowawayDatabase();
    const databaseNames = throwawayDatabaseNames();
    console.log(`[e2e] throwaway Mongo databases: ${databaseNames.join(', ')}`);
    expect(databaseNames).toContain('booking_e2e');
    expect(mongosh('print(db.professionals.countDocuments({ id: "alex-garcia" }))')).toBe('1');
    await api.cleanup(); // bookings of aborted runs + seed schedule
  });

  test.afterAll(async () => {
    await api.cleanup();
    await api.dispose();
  });

  test('a client books through the site; the confirmation sends them to the email to cancel, and shows no link', async ({ page }) => {
    const booking = new BookingModal(page);
    await booking.open();
    await booking.chooseService(SERVICE.id);
    await booking.professionalCard(PROFESSIONAL.id).click();
    await booking.setDate(DAY);
    expect(await booking.slots()).toContain(UI_TIME);
    await booking.pickTime(UI_TIME);
    await booking.next();
    await booking.fillClient(UI_CLIENT);

    // The one-time token still comes back in the creation response (the email is built from it).
    const created = page.waitForResponse((response) => response.request().method() === 'POST' && /\/api\/bookings$/.test(response.url()));
    const confirmation = await booking.submit();
    const { cancelToken } = await (await created).json();
    expect(cancelToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    await expect(confirmation).toContainText('Para cancelar la reserva puedes hacerlo desde el email.');
    await expect(confirmation.getByRole('link')).toHaveCount(0);
    await expect(confirmation.getByRole('button', { name: 'Copiar enlace' })).toHaveCount(0);
    await expect(confirmation).not.toContainText('/cancelar/');
    await expect(confirmation).not.toContainText(cancelToken);
    await expect(page.locator('body')).not.toContainText(cancelToken);

    await confirmation.getByRole('button', { name: /Entendido/ }).click();
    state.token = cancelToken;
    state.bookingId = (await api.bookings()).find((b) => b.client.email === UI_CLIENT.email)._id;
    expect((await api.booking(state.bookingId)).status).toBe('confirmed');
    expect(await slotsOf(api, DAY)).not.toContain(UI_TIME);
  });

  test('the cancel page shows the booking, and no client data, and "Volver" keeps it', async ({ page }) => {
    const cancel = new CancelPage(page);
    await cancel.open(state.token);
    await expect(cancel.row('Servicios:')).toContainText(SERVICE.name);
    await expect(cancel.row('Profesional:')).toContainText(PROFESSIONAL.name);
    await expect(cancel.row('Fecha:')).toContainText(longDateEs(DAY));
    await expect(cancel.row('Hora:')).toContainText(UI_TIME);
    await expect(page.getByText('hasta 1 minuto antes de la hora de inicio')).toBeVisible();
    for (const secret of [UI_CLIENT.name, UI_CLIENT.email, UI_CLIENT.phone]) {
      await expect(page.locator('body')).not.toContainText(secret);
    }

    // The API behind the page answers the summary only: no client data, no ids.
    const summary = await (await api.getCancellation(state.token)).json();
    expect(summary).toEqual({
      state: 'cancellable',
      services: [{ name: SERVICE.name }],
      professional: { name: PROFESSIONAL.name },
      date: DAY,
      time: UI_TIME,
    });

    await cancel.askToCancel();
    await cancel.keepBooking();
    await expect(cancel.cancelButton).toBeVisible();
    expect((await api.booking(state.bookingId)).status).toBe('confirmed');
  });

  test('confirming cancels, keeps the booking as history, frees the slot and is idempotent', async ({ page }) => {
    const cancel = new CancelPage(page);
    await cancel.open(state.token);
    await cancel.askToCancel();
    await cancel.confirmCancellation();
    await expect(cancel.title('Tu reserva fue cancelada')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Reservar de nuevo' })).toHaveAttribute('href', '/');

    const kept = await api.booking(state.bookingId); // still there: the history is kept
    expect(kept).toMatchObject({ status: 'cancelled', date: DAY, time: UI_TIME });
    expect(await slotsOf(api, DAY)).toContain(UI_TIME);

    await cancel.open(state.token);
    await expect(cancel.title('Esta reserva ya fue cancelada')).toBeVisible();
    await expect(cancel.cancelButton).toHaveCount(0);

    const again = await api.cancelByToken(state.token);
    expect(again.status()).toBe(200);
    expect((await again.json()).state).toBe('cancelled');
  });

  test('an unknown or malformed token is "not found" in the page and 404 in the API', async ({ page }) => {
    const cancel = new CancelPage(page);
    await cancel.open(WELL_FORMED_UNKNOWN_TOKEN);
    await expect(cancel.title('No encontramos esta reserva')).toBeVisible();
    await expect(cancel.cancelButton).toHaveCount(0);

    for (const token of [WELL_FORMED_UNKNOWN_TOKEN, 'not-a-token']) {
      expect((await api.getCancellation(token)).status()).toBe(404);
      expect((await api.cancelByToken(token)).status()).toBe(404);
    }
  });

  test('a booking whose start has passed is closed: no cancel button, 409 from the API', async ({ page }) => {
    // The backend does not reject past dates, so the state is reached through the public booking API.
    const created = await api.createBooking({ client: PAST_CLIENT, date: PAST_MONDAY, time: PAST_TIME });
    state.pastId = created._id;
    state.pastToken = created.cancelToken;

    const cancel = new CancelPage(page);
    await cancel.open(state.pastToken);
    await expect(cancel.title('Ya no se puede cancelar esta reserva')).toBeVisible();
    await expect(cancel.cancelButton).toHaveCount(0);
    await expect(cancel.row('Servicios:')).toContainText(SERVICE.name);

    expect((await (await api.getCancellation(state.pastToken)).json()).state).toBe('closed');
    expect((await api.cancelByToken(state.pastToken)).status()).toBe(409);
    expect((await api.booking(state.pastId)).status).toBe('confirmed');
  });

  test('the booking response carries the token once and never the hash', async () => {
    const created = await api.createBooking({ client: API_CLIENT, date: DAY, time: API_TIME });
    state.apiId = created._id;
    state.apiToken = created.cancelToken;
    expect(created.cancelToken).toHaveLength(43);
    expect(created).not.toHaveProperty('cancelTokenHash');

    // Admin reads never expose either field.
    const everything = await api.bookings();
    expect(everything.length).toBeGreaterThan(0);
    for (const item of everything) {
      expect(item).not.toHaveProperty('cancelTokenHash');
      expect(item).not.toHaveProperty('cancelToken');
    }
    expect(await api.booking(state.apiId)).not.toHaveProperty('cancelTokenHash');

    // What the database keeps is the SHA-256 of the token, never the token itself.
    const stored = JSON.parse(mongosh(`print(JSON.stringify(db.bookings.findOne({ _id: ObjectId("${state.apiId}") })))`));
    expect(stored.cancelTokenHash).toBe(createHash('sha256').update(created.cancelToken).digest('hex'));
    expect(JSON.stringify(stored)).not.toContain(created.cancelToken);
  });

  test('the booking routes need the admin key; the public routes do not', async () => {
    const id = state.apiId;
    const calls = {
      'GET /api/bookings': (headers) => api.ctx.get('/api/bookings', { headers }),
      'GET /api/bookings/statistics': (headers) => api.ctx.get('/api/bookings/statistics', { headers }),
      'GET /api/bookings/:id': (headers) => api.ctx.get(`/api/bookings/${id}`, { headers }),
      'PATCH /api/bookings/:id': (headers) => api.ctx.patch(`/api/bookings/${id}`, { headers, data: { notes: 'E2E note' } }),
      'DELETE /api/bookings/:id': (headers) => api.ctx.delete(`/api/bookings/${id}`, { headers }),
    };
    for (const [name, call] of Object.entries(calls)) {
      expect(await call({}).then((r) => r.status()), `${name} without a key`).toBe(401);
      expect(await call({ Authorization: 'Bearer wrong-key' }).then((r) => r.status()), `${name} with a wrong key`).toBe(401);
    }
    // The rejected PATCH and DELETE changed nothing.
    expect(await api.booking(id)).toMatchObject({ status: 'confirmed' });
    expect((await api.booking(id)).notes).not.toBe('E2E note');

    // With the key they work (DELETE last: it removes the booking).
    for (const name of ['GET /api/bookings', 'GET /api/bookings/statistics', 'GET /api/bookings/:id', 'PATCH /api/bookings/:id']) {
      expect((await calls[name](adminHeaders)).status(), `${name} with the key`).toBe(200);
    }
    expect((await api.booking(id)).notes).toBe('E2E note');
    expect((await calls['DELETE /api/bookings/:id'](adminHeaders)).status()).toBe(200);
    expect((await api.bookings()).some((b) => b._id === id)).toBe(false);

    // Public: no key at all.
    const availability = await api.ctx.post('/api/bookings/availability', {
      data: { date: DAY, time: UI_TIME, professionalId: PROFESSIONAL.id, serviceIds: [SERVICE.id] },
    });
    expect(availability.status()).toBe(201);
    expect(await availability.json()).toEqual({ available: true });
    expect((await api.ctx.get('/api/availability', { params: { date: DAY, serviceIds: SERVICE.id } })).status()).toBe(200);
    expect((await api.getCancellation(state.pastToken)).status()).toBe(200);
    expect((await api.cancelByToken(state.token)).status()).toBe(200); // already cancelled: idempotent
  });

  test('the admin cancels a booking past its cutoff from the panel; "Volver" changes nothing', async ({ page }) => {
    const admin = await AdminBookingsPage.loginAndOpen(page);
    const row = await admin.row(PAST_CLIENT.name);
    await expect(row).toBeVisible();
    await expect(row).not.toContainText('Cancelada');

    await admin.askToCancel(row);
    await admin.keepBooking();
    await expect(row.getByRole('button', { name: 'Cancelar reserva' })).toBeVisible();
    expect((await api.booking(state.pastId)).status).toBe('confirmed');

    await admin.askToCancel(row);
    await admin.confirmCancellation();
    await expect(admin.toast(`Reserva de ${PAST_CLIENT.name} cancelada`)).toBeVisible();
    await expect(row).toContainText('Cancelada');
    await expect(row.getByRole('button', { name: 'Cancelar reserva' })).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Eliminar reserva' })).toBeVisible();

    expect((await api.booking(state.pastId)).status).toBe('cancelled'); // no cutoff for the admin
    expect((await (await api.getCancellation(state.pastToken)).json()).state).toBe('cancelled');
  });

  test('a client cancelling from the link updates the open admin panel live', async ({ context }) => {
    const created = await api.createBooking({ client: LIVE_CLIENT, date: DAY, time: LIVE_TIME });
    state.liveId = created._id;

    const admin = await AdminBookingsPage.openAuthenticated(context);
    const row = await admin.row(LIVE_CLIENT.name);
    await expect(row).toBeVisible();
    await expect(row).not.toContainText('Cancelada');
    await admin.socketReady;
    // Anything that survives only until a reload would be lost: the marker proves the page was not reloaded.
    await admin.page.evaluate(() => { window.__e2eSamePage = true; });

    // The client cancels from a second tab. Admin tab: no reload, no interaction.
    const clientPage = await context.newPage();
    const cancel = new CancelPage(clientPage);
    await cancel.open(created.cancelToken);
    await cancel.askToCancel();
    await cancel.confirmCancellation();
    await expect(cancel.title('Tu reserva fue cancelada')).toBeVisible();

    await expect(admin.toast('Un cliente canceló una reserva')).toBeVisible();
    await expect(row).toContainText('Cancelada');
    await expect(row.getByRole('button', { name: 'Cancelar reserva' })).toHaveCount(0);
    await expect(admin.bell).toHaveText(''); // no unread badge: a cancellation is not a new booking
    expect(await admin.page.evaluate(() => window.__e2eSamePage)).toBe(true);
    expect((await api.booking(state.liveId)).status).toBe('cancelled');
  });
});
