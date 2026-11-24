import { describe, expect, it } from 'vitest';
import { validate } from '../validate.js';
import { serviceSchema } from './service.schema.js';

const VALID = { name: 'Corte', price: '100', duration: '30', professionals: ['ana'] };

describe('serviceSchema', () => {
  it('accepts a complete service', () => {
    expect(validate(serviceSchema, VALID)).toBeNull();
  });

  it('accepts a price of 0 (numeric limits belong to the backend)', () => {
    expect(validate(serviceSchema, { ...VALID, price: '0' })).toBeNull();
  });

  it.each(['', '   '])('rejects the name %j', (name) => {
    expect(validate(serviceSchema, { ...VALID, name })).toBe('El nombre es obligatorio');
  });

  it('rejects an empty price with "Ingresa el precio"', () => {
    expect(validate(serviceSchema, { ...VALID, price: '' })).toBe('Ingresa el precio');
  });

  it('rejects an empty duration with "Ingresa la duración"', () => {
    expect(validate(serviceSchema, { ...VALID, duration: '' })).toBe('Ingresa la duración');
  });

  it('rejects no professional with "Selecciona al menos un profesional"', () => {
    expect(validate(serviceSchema, { ...VALID, professionals: [] })).toBe('Selecciona al menos un profesional');
  });

  it('reports the first problem in the order name, price, duration, professionals', () => {
    const empty = { name: '', price: '', duration: '', professionals: [] };
    expect(validate(serviceSchema, empty)).toBe('El nombre es obligatorio');
    expect(validate(serviceSchema, { ...empty, name: 'x' })).toBe('Ingresa el precio');
    expect(validate(serviceSchema, { ...empty, name: 'x', price: '1' })).toBe('Ingresa la duración');
    expect(validate(serviceSchema, { ...empty, name: 'x', price: '1', duration: '5' }))
      .toBe('Selecciona al menos un profesional');
  });
});
