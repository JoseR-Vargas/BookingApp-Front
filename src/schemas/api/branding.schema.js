// ===== BRANDING RESPONSE =====
// GET /api/branding: business name, colors and the logo URL (relative to the backend).

import { z } from 'zod';

export const brandingSchema = z.looseObject({
  businessName: z.string().nullable(),
  colors: z.looseObject({
    accent: z.string(),
    background: z.string(),
    text: z.string(),
    // null: the buttons follow the accent.
    button: z.string().nullable(),
  }),
  logoUrl: z.string().nullable(),
});
