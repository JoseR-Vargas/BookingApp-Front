import { describe, expect, it } from 'vitest';
import { describeResponseSchema } from '../../test/schemaCases.js';
import { publicAvailabilitySchema } from './public-availability.schema.js';

const ENABLED = {
  enabled: true,
  services: [{ id: 'servicio-basico', name: 'Servicio Básico', duration: 60 }],
  serviceId: 'servicio-basico',
  locationId: 'principal',
  locations: [{ id: 'principal', name: 'Principal' }, { id: 'norte', name: 'Norte' }],
  days: [
    {
      date: '2030-01-07',
      closed: false,
      times: [{ time: '09:00', professionals: [{ id: 'alex-garcia', name: 'Alex García' }] }],
    },
    { date: '2030-01-06', closed: true, times: [] },
  ],
};

describeResponseSchema('publicAvailabilitySchema (enabled)', publicAvailabilitySchema, ENABLED, [
  'enabled',
  'services',
  'services.0.id',
  'services.0.name',
  'services.0.duration',
  'days',
  'days.0.date',
  'days.0.closed',
  'days.0.times',
  'days.0.times.0.time',
  'days.0.times.0.professionals',
  'days.0.times.0.professionals.0.id',
  'days.0.times.0.professionals.0.name',
]);

describe('publicAvailabilitySchema other shapes', () => {
  it('accepts the disabled answer', () => {
    expect(publicAvailabilitySchema.parse({ enabled: false })).toEqual({ enabled: false });
  });

  it('accepts an enabled answer with no service published (serviceId null) and no locations', () => {
    const { locationId, locations, ...rest } = ENABLED;
    expect(publicAvailabilitySchema.safeParse({ ...rest, serviceId: null, days: [] }).success).toBe(true);
  });

  it('rejects an answer without the enabled flag', () => {
    expect(publicAvailabilitySchema.safeParse({ services: [], days: [] }).success).toBe(false);
  });
});
