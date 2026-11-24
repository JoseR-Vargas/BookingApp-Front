import { describe, expect, it } from 'vitest';
import { describeResponseSchema } from '../../test/schemaCases.js';
import { availabilityCheckSchema, availabilitySchema } from './availability.schema.js';

const AVAILABILITY = {
  date: '2030-01-07',
  closed: false,
  location: { id: 'principal', name: 'Principal' },
  services: [{ id: 'servicio-basico', name: 'Servicio Básico', duration: 60 }],
  totalDuration: 60,
  professionals: [
    { id: 'alex-garcia', name: 'Alex García', slots: ['09:00', '10:00'] },
    { id: 'maria-lopez', name: 'María López', slots: [] },
  ],
};

describeResponseSchema('availabilitySchema (GET /api/availability)', availabilitySchema, AVAILABILITY, [
  'date',
  'closed',
  'professionals',
  'professionals.0.id',
  'professionals.0.name',
  'professionals.0.slots',
]);

describe('availabilitySchema optional parts', () => {
  it('accepts a closed day without location, services or totals', () => {
    expect(availabilitySchema.safeParse({ date: '2030-01-06', closed: true, professionals: [] }).success).toBe(true);
  });
});

describeResponseSchema('availabilityCheckSchema (POST /api/bookings/availability)', availabilityCheckSchema, { available: true }, [
  'available',
]);
