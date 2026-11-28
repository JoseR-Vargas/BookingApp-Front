// The panel of a business learns about a new booking by polling (there is no live socket in a
// serverless deployment): the endpoint answers the ids of the latest bookings, without the data of
// the client, and the panel announces a booking that arrived.
import { test, expect } from '../../fixtures/test.js';
import { createApi } from '../../support/api.js';
import { nextWeekday } from '../../support/dates.js';
import { ADMIN_KEY, BACKEND_ORIGIN, FAKE_EMAIL_DOMAIN } from '../../support/env.js';

const HEADERS = { Authorization: `Bearer ${ADMIN_KEY}` };

let api;

test.describe.configure({ mode: 'serial' });
test.describe('the live updates of the panel, end to end', () => {
  test.beforeAll(async () => {
    api = await createApi();
    await api.assertThrowawayDatabase();
  });

  test.afterAll(async () => {
    await api.cleanup();
    await api.dispose();
  });

  test('the endpoint answers the ids of the latest bookings, without the data of the client', async ({ request }) => {
    const created = await api.createBooking({
      client: { name: 'Cliente Sondeo', email: `sondeo@${FAKE_EMAIL_DOMAIN}`, phone: '3001112223' },
      date: nextWeekday(5, 1),
      time: '10:00',
    });
    const id = created._id ?? created.id;

    const answer = JSON.parse(await (await request.get(`${BACKEND_ORIGIN}/api/bookings/ids`, { headers: HEADERS })).text());
    expect(answer.ids).toContain(id);
    // No data of the client travels in the answer.
    expect(JSON.stringify(answer)).not.toContain('Cliente Sondeo');
    expect(JSON.stringify(answer)).not.toContain('sondeo@');
    expect(JSON.stringify(answer)).not.toContain('3001112223');
  });

  test('the endpoint needs the admin key', async ({ request }) => {
    expect((await request.get(`${BACKEND_ORIGIN}/api/bookings/ids`)).status()).toBe(401);
  });
});
