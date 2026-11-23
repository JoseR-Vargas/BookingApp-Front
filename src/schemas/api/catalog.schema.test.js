import { describe, expect, it } from 'vitest';
import { ADMIN_CATALOG, CATALOG } from '../../test/catalogFixture.js';
import { describeResponseSchema } from '../../test/schemaCases.js';
import { adminCatalogSchema, catalogSchema } from './catalog.schema.js';

const LOCATION = {
  id: 'principal',
  name: 'Principal',
  address: 'Calle 1',
  schedule: { ...CATALOG.schedule, startIntervalMinutes: 30 },
};

const PUBLIC = {
  ...CATALOG,
  professionals: CATALOG.professionals.map((p) => ({ ...p, photoUrl: null, locations: ['principal'] })),
  locations: [LOCATION],
};

const ADMIN = {
  ...ADMIN_CATALOG,
  professionals: ADMIN_CATALOG.professionals.map((p) => ({ ...p, photoUrl: null, locations: ['principal'] })),
  locations: [{ ...LOCATION, active: true }],
  publicAvailability: { enabled: true, days: 7, serviceIds: null },
};

const COMMON_REQUIRED = [
  'professionals',
  'professionals.0.id',
  'professionals.0.name',
  'professionals.0.specialty',
  'professionals.0.experience',
  'professionals.0.rating',
  'professionals.0.avatar',
  'services',
  'services.0.id',
  'services.0.name',
  'services.0.description',
  'services.0.price',
  'services.0.duration',
  'services.0.professionals',
  'services.0.icon',
  'schedule',
  'schedule.weekly',
  'schedule.weekly.1.closed',
  'schedule.weekly.1.open',
  'schedule.weekly.1.close',
  'schedule.slotIntervalMinutes',
];

describeResponseSchema('catalogSchema (GET /api/catalog)', catalogSchema, PUBLIC, [
  ...COMMON_REQUIRED,
  'locations.0.id',
  'locations.0.name',
  'locations.0.address',
  'locations.0.schedule',
]);

describeResponseSchema('adminCatalogSchema (GET /api/admin/catalog)', adminCatalogSchema, ADMIN, [
  ...COMMON_REQUIRED,
  'professionals.0.active',
  'services.0.active',
  'locations.0.id',
  'locations.0.active',
  'publicAvailability.enabled',
  'publicAvailability.days',
]);

describe('optional parts of the catalog', () => {
  it('accepts the catalog without locations (a backend with no locations of its own)', () => {
    expect(catalogSchema.safeParse(CATALOG).success).toBe(true);
  });

  it('accepts the admin catalog without locations and without publicAvailability', () => {
    expect(adminCatalogSchema.safeParse(ADMIN_CATALOG).success).toBe(true);
  });

  it('accepts a day with its own start times, and a closed day with nothing else', () => {
    const catalog = structuredClone(CATALOG);
    catalog.schedule.weekly[1] = { closed: false, open: '09:00', close: '12:00', starts: ['09:00', '10:30'] };
    expect(catalogSchema.safeParse(catalog).success).toBe(true);
  });

  it('accepts a professional with a null photoUrl and a service list that is empty', () => {
    const catalog = structuredClone(CATALOG);
    catalog.professionals[0].photoUrl = null;
    catalog.services[0].professionals = [];
    expect(catalogSchema.safeParse(catalog).success).toBe(true);
  });

  it('rejects a start list that is not strings', () => {
    const catalog = structuredClone(CATALOG);
    catalog.schedule.weekly[1] = { closed: false, open: '09:00', close: '12:00', starts: [900] };
    expect(catalogSchema.safeParse(catalog).success).toBe(false);
  });

  it('accepts a publicAvailability that publishes a list of services', () => {
    const admin = structuredClone(ADMIN);
    admin.publicAvailability = { enabled: false, days: 14, serviceIds: ['consulta-inicial'] };
    expect(adminCatalogSchema.safeParse(admin).success).toBe(true);
  });
});
