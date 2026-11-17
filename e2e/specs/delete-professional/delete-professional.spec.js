// Permanent delete of a professional, end to end against the local backend + throwaway Mongo. It is
// blocked while the professional has future confirmed bookings or is the only one offering a service;
// past bookings never block and are kept. Fake data only; see e2e/support/env.js.
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
const made = { services: [], professionals: [] };

test.describe.configure({ mode: 'serial' });

test.describe('delete a professional, end to end', () => {
  const post = (request, path, data) => request.post(`${BACKEND_ORIGIN}/api/admin/${path}`, { headers: HEADERS, data });
  const permanent = (request, id, headers = HEADERS) => request.delete(`${BACKEND_ORIGIN}/api/admin/professionals/${id}/permanent`, { headers });

  async function createProfessional(request, name) {
    const response = await post(request, 'professionals', { name, specialty: 'E2E', experience: '1 año' });
    expect(response.status()).toBe(201);
    const professional = await response.json();
    made.professionals.push(professional.id);
    return professional;
  }

  async function createService(request, name, professionals) {
    const response = await post(request, 'services', { name, description: `Fake service ${RUN}`, price: 100, duration: 30, professionals });
    expect(response.status()).toBe(201);
    const service = await response.json();
    made.services.push(service.id);
    return service;
  }

  const bookingsOf = async (id) => (await api.bookings()).filter((booking) => booking.professional?.id === id);

  test.beforeAll(async () => {
    api = await createApi();
    await api.assertThrowawayDatabase();
    await api.cleanup();
  });

  test.afterAll(async () => {
    await api.cleanup();
    for (const id of made.services) await api.ctx.delete(`/api/admin/services/${id}`, { headers: HEADERS });
    for (const id of made.professionals) await api.ctx.delete(`/api/admin/professionals/${id}`, { headers: HEADERS });
    await api.dispose();
  });

  test('the API: key required, 404, blocked by future bookings and by sole-professional services, then deleted', async ({ request }) => {
    const ana = await createProfessional(request, `E2E Ana ${RUN}`);
    const bruno = await createProfessional(request, `E2E Bruno ${RUN}`);
    const both = await createService(request, `E2E Both ${RUN}`, [ana.id, bruno.id]);
    const solo = await createService(request, `E2E Solo ${RUN}`, [ana.id]);

    expect((await request.delete(`${BACKEND_ORIGIN}/api/admin/professionals/${ana.id}/permanent`)).status()).toBe(401);
    expect((await permanent(request, 'no-existe')).status()).toBe(404);

    // Bookings are checked first: a future confirmed booking blocks, in singular and plural.
    const first = await api.createBooking({ client: client('a'), date: FUTURE, time: '10:00', serviceId: both.id, professionalId: ana.id });
    let blocked = await permanent(request, ana.id);
    expect(blocked.status()).toBe(409);
    expect((await blocked.json()).message).toBe(
      `No se puede eliminar a ${ana.name}: tiene 1 reserva futura confirmada. Cancélalas o desactiva al profesional.`,
    );
    const second = await api.createBooking({ client: client('b'), date: FUTURE, time: '11:00', serviceId: both.id, professionalId: ana.id });
    blocked = await permanent(request, ana.id);
    expect((await blocked.json()).message).toContain('tiene 2 reservas futuras confirmadas.');
    expect((await api.adminCatalog()).professionals.some((p) => p.id === ana.id)).toBe(true);

    // A cancelled future booking and a past confirmed one do not block; the sole-professional service does.
    for (const booking of [first, second]) {
      await request.patch(`${BACKEND_ORIGIN}/api/bookings/${booking._id}`, { headers: HEADERS, data: { status: 'cancelled' } });
    }
    await api.createBooking({ client: client('c'), date: PAST_MONDAY, time: '10:00', serviceId: both.id, professionalId: ana.id });
    blocked = await permanent(request, ana.id);
    expect(blocked.status()).toBe(409);
    expect((await blocked.json()).message).toBe(
      `No se puede eliminar a ${ana.name}: el servicio "${solo.name}" solo lo ofrece este profesional. Asígnale otro profesional o desactiva el servicio.`,
    );

    // The same rule counts inactive services.
    await request.delete(`${BACKEND_ORIGIN}/api/admin/services/${solo.id}`, { headers: HEADERS });
    expect((await permanent(request, ana.id)).status()).toBe(409);

    // Handing the service to another professional unblocks it.
    const reassigned = await request.patch(`${BACKEND_ORIGIN}/api/admin/services/${solo.id}`, { headers: HEADERS, data: { professionals: [ana.id, bruno.id] } });
    expect(reassigned.status()).toBe(200);
    const deleted = await permanent(request, ana.id);
    expect(deleted.status()).toBe(200);
    expect(await deleted.json()).toEqual({ id: ana.id, deleted: true });

    const catalog = await api.adminCatalog();
    expect(catalog.professionals.some((p) => p.id === ana.id)).toBe(false);
    expect(catalog.services.find((s) => s.id === both.id).professionals).toEqual([bruno.id]);
    expect(catalog.services.find((s) => s.id === solo.id).professionals).toEqual([bruno.id]);
    expect((await request.get(`${BACKEND_ORIGIN}/api/catalog/professionals/${ana.id}/photo`)).status()).toBe(404);
    expect((await permanent(request, ana.id)).status()).toBe(404);

    // Her bookings stay, with the name they were made with.
    const kept = await bookingsOf(ana.id);
    expect(kept).toHaveLength(3);
    expect(kept.every((booking) => booking.professional.name === ana.name)).toBe(true);

    // A deleted professional that has bookings never gives its id away to a namesake.
    const namesake = await createProfessional(request, ana.name);
    expect(namesake.id).not.toBe(ana.id);

    // Without bookings the id is free again.
    const temp = await createProfessional(request, `E2E Temp ${RUN}`);
    expect((await permanent(request, temp.id)).status()).toBe(200);
    expect((await createProfessional(request, temp.name)).id).toBe(temp.id);

    // The soft delete keeps its meaning: deactivate only.
    const soft = await request.delete(`${BACKEND_ORIGIN}/api/admin/professionals/${bruno.id}`, { headers: HEADERS });
    expect(await soft.json()).toMatchObject({ id: bruno.id, active: false });
    expect((await api.adminCatalog()).professionals.some((p) => p.id === bruno.id)).toBe(true);
  });

  test('the panel: "Eliminar" asks first, deletes after confirming and explains a blocked delete', async ({ context, request }) => {
    const free = await createProfessional(request, `E2E Free ${RUN}`);
    const busy = await createProfessional(request, `E2E Busy ${RUN}`);
    const service = await createService(request, `E2E Shared ${RUN}`, [busy.id, 'alex-garcia']);
    await api.createBooking({ client: client('d'), date: FUTURE, time: '12:00', serviceId: service.id, professionalId: busy.id });

    const admin = await AdminConfigPage.open(context);
    const { page } = admin;
    await admin.openTab('professionals');
    const dialog = page.getByRole('alertdialog');

    // Cancelling changes nothing.
    await admin.row('professional', free.name).getByRole('button', { name: 'Eliminar' }).click();
    await expect(dialog).toContainText(free.name);
    await expect(dialog).toContainText('de forma permanente');
    await expect(dialog).toContainText('reservas pasadas se conservan');
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
    await expect(admin.row('professional', free.name)).toBeVisible();

    // Confirming deletes it for good.
    await admin.row('professional', free.name).getByRole('button', { name: 'Eliminar' }).click();
    await dialog.getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.getByText('Profesional eliminado')).toBeVisible();
    await expect(admin.row('professional', free.name)).toHaveCount(0);
    expect((await api.adminCatalog()).professionals.some((p) => p.id === free.id)).toBe(false);

    // With a future booking it is refused, with the reason on screen, and the row stays.
    await admin.row('professional', busy.name).getByRole('button', { name: 'Eliminar' }).click();
    await dialog.getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.getByText(`No se puede eliminar a ${busy.name}: tiene 1 reserva futura confirmada.`)).toBeVisible();
    await expect(admin.row('professional', busy.name)).toBeVisible();
    expect((await api.adminCatalog()).professionals.some((p) => p.id === busy.id)).toBe(true);
  });
});
