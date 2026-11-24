// ===== AVAILABILITY RESPONSES =====
// GET /api/availability (free start times per professional) and POST /api/bookings/availability.

import { z } from 'zod';

export const availabilitySchema = z.looseObject({
  date: z.string(),
  closed: z.boolean(),
  professionals: z.array(z.looseObject({
    id: z.string(),
    name: z.string(),
    slots: z.array(z.string()),
  })),
});

export const availabilityCheckSchema = z.looseObject({
  available: z.boolean(),
});
