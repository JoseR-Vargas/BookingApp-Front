// ===== SESSION RESPONSE =====
// GET /api/admin/session answers { ok: true } when the admin key is accepted.

import { z } from 'zod';

export const sessionSchema = z.looseObject({ ok: z.literal(true) });
