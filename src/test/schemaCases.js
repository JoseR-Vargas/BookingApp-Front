// Shared checks for the response schemas: the valid fixture passes, an unknown extra field is kept,
// and every required field is rejected when missing or when it has another type.

import { describe, expect, it } from 'vitest';

const clone = (value) => JSON.parse(JSON.stringify(value));

function parentOf(root, path) {
  const keys = path.split('.');
  const last = keys.pop();
  let node = root;
  for (const key of keys) node = node[key];
  return [node, last];
}

/**
 * @param schema the zod schema under test
 * @param valid a valid payload
 * @param required dotted paths of the required fields ('professionals.0.id' walks arrays too)
 */
export function describeResponseSchema(name, schema, valid, required) {
  describe(name, () => {
    it('accepts the valid payload unchanged', () => {
      expect(schema.parse(clone(valid))).toEqual(valid);
    });

    it('accepts and keeps a field added later by the backend', () => {
      const withExtra = clone(valid);
      // A list answer carries the new field on its items.
      const holder = Array.isArray(withExtra) ? withExtra[0] : withExtra;
      holder.addedByBackend = { a: 1 };
      expect(schema.parse(withExtra)).toEqual(withExtra);
    });

    it.each(required)('rejects the payload when "%s" is missing', (path) => {
      const broken = clone(valid);
      const [parent, key] = parentOf(broken, path);
      delete parent[key];
      expect(schema.safeParse(broken).success).toBe(false);
    });

    it.each(required)('rejects the payload when "%s" has another type', (path) => {
      const broken = clone(valid);
      const [parent, key] = parentOf(broken, path);
      parent[key] = typeof parent[key] === 'object' && parent[key] !== null ? 'wrong' : { wrong: true };
      expect(schema.safeParse(broken).success).toBe(false);
    });
  });
}
