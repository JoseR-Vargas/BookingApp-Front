// Permanent delete of a service, end to end against the local backend + throwaway Mongo. It is blocked
// while the service has future confirmed bookings; past and cancelled bookings never block and are
// kept with the service name they were made with. Fake data only; see e2e/support/env.js.
import { test, expect } from '../../fixtures/test.js';
import { AdminConfigPage } from '../../pages/admin/AdminConfigPage.js';
import { createApi } from '../../support/api.js';
import { nextWeekday, PAST_MONDAY } from '../../support/dates.js';
import { ADMIN_KEY, BACKEND_ORIGIN, FAKE_EMAIL_DOMAIN } from '../../support/env.js';

const RUN = Date.now().toString(36);
const HEADERS = { Authorization: `Bearer ${ADMIN_KEY}` };
const client = (tag) => ({ name: `E2E Client ${tag} ${RUN}`, email: `e2e+${tag}${RUN}@${FAKE_EMAIL_DOMAIN}`, phone: '+59800000000' });
const FUTURE = nextWeekday(3);

let api;
const madeServices = [];

test.describe.configure({ mode: 'serial' });

test.describe('delete a service, end to end', () => {
  const permanent = (request, id, headers = HEADERS) => request.delete(`${BACKEND_ORIGIN}/api/admin/services/${id}/permanent`, { headers });

  async function createService(request, name) {
    const response = await request.post(`${BACKEND_ORIGIN}/api/admin/services`, {
      headers: HEADERS,
      data: { name, description: `Fake service ${RUN}`, price: 100, duration: 30, professionals: ['alex-garcia'] },
    });
    expect(response.status()).toBe(201);
    const service = await response.json();
    madeServices.push(service.id);
    return service;
  }

  const catalogHas = async (id) => (await api.adminCatalog()).services.some((service) => service.id === id);

  test.beforeAll(async () => {
    api = await createApi();
    await api.assertThrowawayDatabase();
    await api.cleanup();
  });

  test.afterAll(async () => {
    await api.cleanup();
    for (const id of madeServices) await api.ctx.delete(`/api/admin/services/${id}`, { headers: HEADERS });
    await api.dispose();
  });

  test('the API: key required, 404, blocked by future bookings, then deleted; bookings and ids are kept safe', async ({ request }) => {
    const corte = await createService(request, `E2E Corte ${RUN}`);

    expect((await request.delete(`${BACKEND_ORIGIN}/api/admin/services/${corte.id}/permanent`)).status()).toBe(401);
    expect((await permanent(request, 'no-existe')).status()).toBe(404);

    // A future confirmed booking blocks, in singular and plural.
    const first = await api.createBooking({ client: client('a'), date: FUTURE, time: '10:00', serviceId: corte.id });
    let blocked = await permanent(request, corte.id);
    expect(blocked.status()).toBe(409);
    expect((await blocked.json()).message).toBe(
      `No se puede eliminar el servicio "${corte.name}": tiene 1 reserva futura confirmada. Cancélalas o desactiva el servicio.`,
    );
    const second = await api.createBooking({ client: client('b'), date: FUTURE, time: '11:00', serviceId: corte.id });
    blocked = await permanent(request, corte.id);
    expect((await blocked.json()).message).toContain('tiene 2 reservas futuras confirmadas.');
    expect(await catalogHas(corte.id)).toBe(true);

    // Cancelled future bookings and a past confirmed one do not block.
    for (const booking of [first, second]) {
      await request.patch(`${BACKEND_ORIGIN}/api/bookings/${booking._id}`, { headers: HEADERS, data: { status: 'cancelled' } });
    }
    await api.createBooking({ client: client('c'), date: PAST_MONDAY, time: '10:00', serviceId: corte.id });
    const deleted = await permanent(request, corte.id);
    expect(deleted.status()).toBe(200);
    expect(await deleted.json()).toEqual({ id: corte.id, deleted: true });
    expect(await catalogHas(corte.id)).toBe(false);
    expect((await permanent(request, corte.id)).status()).toBe(404);

    // The bookings stay, with the service they were made with.
    const kept = (await api.bookings()).filter((booking) => booking.services.some((service) => service.id === corte.id));
    expect(kept).toHaveLength(3);
    expect(kept.every((booking) => booking.services[0].name === corte.name)).toBe(true);

    // A deleted service that has bookings never gives its id to a namesake.
    const namesake = await createService(request, corte.name);
    expect(namesake.id).not.toBe(corte.id);

    // Without bookings the id is free again.
    const temp = await createService(request, `E2E Temp ${RUN}`);
    expect((await permanent(request, temp.id)).status()).toBe(200);
    expect((await createService(request, temp.name)).id).toBe(temp.id);

    // The soft delete keeps its meaning: deactivate only (and an inactive service can be deleted for good).
    const soft = await request.delete(`${BACKEND_ORIGIN}/api/admin/services/${namesake.id}`, { headers: HEADERS });
    expect(await soft.json()).toMatchObject({ id: namesake.id, active: false });
    expect(await catalogHas(namesake.id)).toBe(true);
    expect((await permanent(request, namesake.id)).status()).toBe(200);
  });

  test('the panel: "Eliminar" asks first, deletes after confirming and explains a blocked delete', async ({ context, request }) => {
    const free = await createService(request, `E2E Free ${RUN}`);
    const busy = await createService(request, `E2E Busy ${RUN}`);
    await api.createBooking({ client: client('d'), date: FUTURE, time: '12:00', serviceId: busy.id });

    const admin = await AdminConfigPage.open(context);
    const { page } = admin;
    await admin.openTab('services');
    const dialog = page.getByRole('alertdialog');

    // Cancelling changes nothing.
    await admin.row('service', free.name).getByRole('button', { name: 'Eliminar' }).click();
    await expect(dialog).toContainText(free.name);
    await expect(dialog).toContainText('de forma permanente');
    await expect(dialog).toContainText('reservas pasadas se conservan');
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
    await expect(admin.row('service', free.name)).toBeVisible();

    // Confirming deletes it for good.
    await admin.row('service', free.name).getByRole('button', { name: 'Eliminar' }).click();
    await dialog.getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.getByText('Servicio eliminado')).toBeVisible();
    await expect(admin.row('service', free.name)).toHaveCount(0);
    expect(await catalogHas(free.id)).toBe(false);

    // With a future booking it is refused, with the reason on screen, and the row stays.
    await admin.row('service', busy.name).getByRole('button', { name: 'Eliminar' }).click();
    await dialog.getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.getByText(`No se puede eliminar el servicio "${busy.name}": tiene 1 reserva futura confirmada.`)).toBeVisible();
    await expect(admin.row('service', busy.name)).toBeVisible();
    expect(await catalogHas(busy.id)).toBe(true);
  });
});
