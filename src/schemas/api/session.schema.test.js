import { describe, expect, it } from 'vitest';
import { sessionSchema } from './session.schema.js';

describe('sessionSchema (GET /api/admin/session)', () => {
  it('accepts { ok: true } and keeps added fields', () => {
    expect(sessionSchema.parse({ ok: true })).toEqual({ ok: true });
    expect(sessionSchema.parse({ ok: true, user: 'x' })).toEqual({ ok: true, user: 'x' });
  });

  it.each([[{}], [{ ok: false }], [{ ok: 'yes' }], [null], ['ok']])('rejects %j', (body) => {
    expect(sessionSchema.safeParse(body).success).toBe(false);
  });
});
