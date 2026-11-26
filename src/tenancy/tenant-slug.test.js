import { describe, it, expect } from 'vitest';
import { slugify } from './tenant-slug.js';

describe('slugify', () => {
  it.each([
    ['Barbería Don Pepe', 'barberia-don-pepe'],
    ['  Mi   Negocio!! ', 'mi-negocio'],
    ['Ñandú & Co.', 'nandu-co'],
    ['', ''],
    [undefined, ''],
  ])('%s -> %s', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it('never ends with a dash after cutting to 40 characters', () => {
    const slug = slugify(`${'a'.repeat(39)} bbbbb`);
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
  });
});
