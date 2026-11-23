import { describe, expect, it } from 'vitest';
import { validate } from '../validate.js';
import { locationSchema } from './location.schema.js';

describe('locationSchema', () => {
  it('accepts a location with a name and no address', () => {
    expect(validate(locationSchema, { name: 'Centro', address: '' })).toBeNull();
  });

  it.each(['', '   '])('rejects the name %j with "El nombre es obligatorio"', (name) => {
    expect(validate(locationSchema, { name, address: 'Calle 1' })).toBe('El nombre es obligatorio');
  });
});
