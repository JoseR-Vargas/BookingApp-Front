// ===== PUBLIC AVAILABILITY RESPONSE =====
// GET /api/public-availability (the /disponibilidad page): off, or the next days with their free times.

import { z } from 'zod';

const disabled = z.looseObject({ enabled: z.literal(false) });

const enabled = z.looseObject({
  enabled: z.literal(true),
  services: z.array(z.looseObject({ id: z.string(), name: z.string(), duration: z.number() })),
  // null: no service is published yet.
  serviceId: z.string().nullable().optional(),
  locationId: z.string().optional(),
  locations: z.array(z.looseObject({ id: z.string(), name: z.string() })).optional(),
  days: z.array(z.looseObject({
    date: z.string(),
    closed: z.boolean(),
    times: z.array(z.looseObject({
      time: z.string(),
      professionals: z.array(z.looseObject({ id: z.string(), name: z.string() })),
    })),
  })),
});

export const publicAvailabilitySchema = z.union([disabled, enabled]);
