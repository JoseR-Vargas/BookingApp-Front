import { describe, expect, it } from 'vitest';
import { validate } from '../validate.js';
import { professionalSchema } from './professional.schema.js';

const VALID = { name: 'Ana', specialty: '', experience: '' };

describe('professionalSchema', () => {
  it('accepts a professional with just a name when locations are not asked for', () => {
    expect(validate(professionalSchema({ requireLocations: false }), VALID)).toBeNull();
  });

  it('rejects an empty name with "El nombre es obligatorio"', () => {
    expect(validate(professionalSchema({ requireLocations: false }), { ...VALID, name: '' }))
      .toBe('El nombre es obligatorio');
  });

  it('rejects a name that is only spaces', () => {
    expect(validate(professionalSchema({ requireLocations: false }), { ...VALID, name: '   ' }))
      .toBe('El nombre es obligatorio');
  });

  it('with several locations, rejects an empty choice with "Elige al menos un local"', () => {
    expect(validate(professionalSchema({ requireLocations: true }), { ...VALID, locations: [] }))
      .toBe('Elige al menos un local');
  });

  it('with several locations, accepts a non-empty choice', () => {
    expect(validate(professionalSchema({ requireLocations: true }), { ...VALID, locations: ['centro'] })).toBeNull();
  });

  it('reports the name before the locations when both are missing (same order as before)', () => {
    expect(validate(professionalSchema({ requireLocations: true }), { ...VALID, name: '', locations: [] }))
      .toBe('El nombre es obligatorio');
  });

  it('ignores locations when they are not asked for', () => {
    expect(validate(professionalSchema({ requireLocations: false }), { ...VALID, locations: [] })).toBeNull();
  });
});
