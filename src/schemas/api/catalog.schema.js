// ===== CATALOG RESPONSES =====
// GET /api/catalog (public) and GET /api/admin/catalog. Only what the UI reads is required; objects
// are loose so a field the backend adds later is accepted and kept.

import { z } from 'zod';

const closedDay = z.looseObject({ closed: z.literal(true) });
const openDay = z.looseObject({
  closed: z.literal(false),
  open: z.string(),
  close: z.string(),
  // The day's own start times (SPEC 06); absent = the general interval applies.
  starts: z.array(z.string()).optional(),
});

// Keys follow Date.getDay(): '0' = Sunday.
export const scheduleSchema = z.looseObject({
  weekly: z.record(z.string(), z.union([closedDay, openDay])),
  slotIntervalMinutes: z.number(),
  startIntervalMinutes: z.number().optional(),
});

const professionalFields = {
  id: z.string(),
  name: z.string(),
  specialty: z.string(),
  experience: z.string(),
  rating: z.number(),
  avatar: z.string(),
  photoUrl: z.string().nullable().optional(),
  locations: z.array(z.string()).optional(),
};

const serviceFields = {
  id: z.string(),
  name: z.string(),
  description: z.string(),
  price: z.number(),
  duration: z.number(),
  professionals: z.array(z.string()),
  icon: z.string(),
};

const locationFields = {
  id: z.string(),
  name: z.string(),
  address: z.string(),
  schedule: scheduleSchema,
};

export const catalogSchema = z.looseObject({
  professionals: z.array(z.looseObject(professionalFields)),
  services: z.array(z.looseObject(serviceFields)),
  schedule: scheduleSchema,
  locations: z.array(z.looseObject(locationFields)).optional(),
});

export const adminCatalogSchema = z.looseObject({
  professionals: z.array(z.looseObject({ ...professionalFields, active: z.boolean() })),
  services: z.array(z.looseObject({ ...serviceFields, active: z.boolean() })),
  schedule: scheduleSchema,
  locations: z.array(z.looseObject({ ...locationFields, active: z.boolean() })).optional(),
  publicAvailability: z.looseObject({
    enabled: z.boolean(),
    days: z.number(),
    serviceIds: z.array(z.string()).nullable(),
  }).optional(),
});
