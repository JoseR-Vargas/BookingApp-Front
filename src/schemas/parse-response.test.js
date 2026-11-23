import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ContractError, CONTRACT_ERROR_MESSAGE } from './contract-error.js';
import { parseResponse } from './parse-response.js';
import { validate } from './validate.js';

const schema = z.looseObject({ id: z.string(), count: z.number().optional() });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ContractError', () => {
  it('is an Error with the Spanish contract message and its own name', () => {
    const error = new ContractError();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ContractError');
    expect(error.message).toBe('La respuesta del servidor no tiene el formato esperado.');
    expect(CONTRACT_ERROR_MESSAGE).toBe(error.message);
  });
});

describe('parseResponse', () => {
  it('returns the data of a valid response', () => {
    const data = { id: 'a', count: 2 };
    expect(parseResponse(schema, data)).toEqual(data);
  });

  it('accepts a field the schema does not know and keeps it (the backend may add fields)', () => {
    expect(parseResponse(schema, { id: 'a', brandNew: { nested: true } })).toEqual({
      id: 'a',
      brandNew: { nested: true },
    });
  });

  it('accepts a missing optional field', () => {
    expect(parseResponse(schema, { id: 'a' })).toEqual({ id: 'a' });
  });

  it('throws a ContractError with the exact message when a required field is missing', () => {
    expect(() => parseResponse(schema, {})).toThrow(ContractError);
    expect(() => parseResponse(schema, {})).toThrow('La respuesta del servidor no tiene el formato esperado.');
  });

  it('throws a ContractError when a field has another type', () => {
    expect(() => parseResponse(schema, { id: 5 })).toThrow(ContractError);
  });

  it('throws a ContractError for a body that is not an object at all', () => {
    expect(() => parseResponse(schema, null)).toThrow(ContractError);
    expect(() => parseResponse(schema, 'oops')).toThrow(ContractError);
  });

  it('logs the zod detail in development, not just the generic message', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => parseResponse(schema, { id: 5 })).toThrow(ContractError);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0].join(' ')).toContain('id');
  });
});

describe('validate', () => {
  const form = z.object({
    name: z.string().trim().min(1, 'El nombre es obligatorio'),
    price: z.string().min(1, 'Ingresa el precio'),
  });

  it('returns null for valid values', () => {
    expect(validate(form, { name: 'Ana', price: '10' })).toBeNull();
  });

  it('returns the message of the first failing field, in schema order', () => {
    expect(validate(form, { name: '  ', price: '' })).toBe('El nombre es obligatorio');
    expect(validate(form, { name: 'Ana', price: '' })).toBe('Ingresa el precio');
  });

  it('does not mutate the values', () => {
    const values = { name: ' Ana ', price: '1' };
    validate(form, values);
    expect(values).toEqual({ name: ' Ana ', price: '1' });
  });
});
