// ===== PUBLIC AVAILABILITY SETTINGS FORM =====
// `serviceIds` null publishes every active service; a list must not be empty. enabled and days are
// always valid by construction (a checkbox and a select), so they are not what fails here.

import { z } from 'zod';

export const publicAvailabilitySettingsSchema = z.object({
  enabled: z.boolean().optional(),
  days: z.number().optional(),
  serviceIds: z.array(z.string()).min(1, 'Elige al menos un servicio o publica todos').nullable(),
});
