import { describe, expect, it } from 'vitest';
import { validate } from '../validate.js';
import { publicAvailabilitySettingsSchema } from './public-availability-settings.schema.js';

describe('publicAvailabilitySettingsSchema', () => {
  it('accepts publishing every service (serviceIds null)', () => {
    expect(validate(publicAvailabilitySettingsSchema, { enabled: true, days: 7, serviceIds: null })).toBeNull();
  });

  it('accepts a chosen list of services', () => {
    expect(validate(publicAvailabilitySettingsSchema, { enabled: true, days: 7, serviceIds: ['corte'] })).toBeNull();
  });

  it('rejects an empty list with "Elige al menos un servicio o publica todos"', () => {
    expect(validate(publicAvailabilitySettingsSchema, { enabled: true, days: 7, serviceIds: [] }))
      .toBe('Elige al menos un servicio o publica todos');
  });
});
