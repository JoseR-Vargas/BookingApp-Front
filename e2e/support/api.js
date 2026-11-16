import { request } from '@playwright/test';
import { ADMIN_KEY, BACKEND_ORIGIN, FAKE_EMAIL_DOMAIN } from './env.js';
import { SEED_WEEKLY } from '../data/seedSchedule.js';

const AUTH = { Authorization: `Bearer ${ADMIN_KEY}` };

async function json(response) {
  if (!response.ok()) throw new Error(`${response.request().method()} ${response.url()} -> ${response.status()}`);
  return response.json();
}

/** Direct HTTP access to the E2E backend, for verification and cleanup. Call `dispose()` when done. */
export async function createApi() {
  const ctx = await request.newContext({ baseURL: BACKEND_ORIGIN });
  const api = {
    ctx,
    auth: AUTH,
    adminCatalog: async () => json(await ctx.get('/api/admin/catalog', { headers: AUTH })),
    saveSchedule: async (weekly) => json(await ctx.put('/api/admin/schedule', { headers: AUTH, data: { weekly } })),
    availability: async (date, serviceId) => json(await ctx.get('/api/availability', {
      params: { date, serviceIds: serviceId },
    })),
    bookings: async () => json(await ctx.get('/api/bookings', { headers: AUTH })),
    booking: async (id) => json(await ctx.get(`/api/bookings/${id}`, { headers: AUTH })),
    // Public routes, no key. The cancel helpers return the raw response so a test can assert the status.
    getCancellation: (token) => ctx.get(`/api/bookings/cancel/${token}`),
    cancelByToken: (token) => ctx.post(`/api/bookings/cancel/${token}`),

    /** Books through the public API. Returns the created booking plus its one-time `cancelToken`. */
    createBooking: async ({ client, date, time, serviceId = 'consulta-inicial', professionalId = 'alex-garcia' }) => json(
      await ctx.post('/api/bookings', {
        data: {
          client,
          date,
          time,
          services: [{ id: serviceId }],
          professional: { id: professionalId, name: 'ignored: the server takes it from the catalog' },
        },
      }),
    ),
    dispose: () => ctx.dispose(),

    // Refuses to continue unless this is the seeded throwaway database: every booking must be fake.
    async assertThrowawayDatabase() {
      const catalog = await api.adminCatalog();
      if (!catalog.professionals.some((p) => p.id === 'alex-garcia')) throw new Error('Database was not seeded');
      const foreign = (await api.bookings()).filter((b) => !isFake(b));
      if (foreign.length > 0) throw new Error('Database holds non-E2E bookings: refusing to run');
    },

    // Removes the bookings of this suite (and of earlier aborted runs) and restores the global config.
    async cleanup({ serviceId, professionalId } = {}) {
      for (const booking of (await api.bookings()).filter(isFake)) {
        await ctx.delete(`/api/bookings/${booking._id}`, { headers: AUTH });
      }
      await api.saveSchedule(SEED_WEEKLY);
      if (serviceId) await ctx.delete(`/api/admin/services/${serviceId}`, { headers: AUTH });
      if (professionalId) await ctx.delete(`/api/admin/professionals/${professionalId}`, { headers: AUTH });
    },
  };
  return api;
}

const isFake = (booking) => String(booking.client?.email).endsWith(`@${FAKE_EMAIL_DOMAIN}`);
