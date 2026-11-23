import { describe, expect, it } from 'vitest';
import { validate } from '../validate.js';
import { clientSchema, CLIENT_FORM_MESSAGE } from './client.schema.js';

const VALID = { name: 'Ana Pérez', id: '', email: 'ana@example.com', phone: '+598 98 114 696', notes: '' };

describe('clientSchema (booking client step)', () => {
  it('uses the exact toast message of the booking flow', () => {
    expect(CLIENT_FORM_MESSAGE).toBe('Por favor completa todos los campos requeridos');
  });

  it('accepts a complete client, with the optional id and notes empty', () => {
    expect(validate(clientSchema, VALID)).toBeNull();
  });

  it.each(['name', 'email', 'phone'])('rejects an empty %s with the required-fields message', (field) => {
    expect(validate(clientSchema, { ...VALID, [field]: '' })).toBe(CLIENT_FORM_MESSAGE);
  });

  it.each(['id', 'notes'])('does not require %s', (field) => {
    expect(validate(clientSchema, { ...VALID, [field]: '' })).toBeNull();
  });

  it('keeps the native rule: a whitespace-only name or phone still counts as filled in', () => {
    expect(validate(clientSchema, { ...VALID, name: '   ', phone: ' ' })).toBeNull();
  });

  it.each(['plainaddress', 'ana@', '@example.com', 'ana@@example.com', 'ana example@x.com', 'ana@-bad.com'])(
    'rejects the invalid email %j',
    (email) => {
      expect(validate(clientSchema, { ...VALID, email })).toBe(CLIENT_FORM_MESSAGE);
    },
  );

  it.each(['a@b', 'ana+tag@example.co.uk', "o'brien@example.com", '  ana@example.com  '])(
    'accepts %j like the native email input does',
    (email) => {
      expect(validate(clientSchema, { ...VALID, email })).toBeNull();
    },
  );
});
