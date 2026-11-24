import { describe, expect, it } from 'vitest';
import { describeResponseSchema } from '../../test/schemaCases.js';
import { bookingListSchema, createdBookingSchema, statisticsSchema } from './booking.schema.js';

const BOOKING = {
  _id: 'b1',
  client: { name: 'Ana', email: 'ana@example.com', phone: '0991100' },
  services: [{ id: 'servicio-basico', name: 'Servicio Básico', price: 1200, duration: 60 }],
  totalPrice: 1200,
  totalDuration: 60,
  professional: { id: 'alex-garcia', name: 'Alex García' },
  location: { id: 'principal', name: 'Principal' },
  date: '2030-01-07',
  time: '10:00',
  slots: ['10:00', '10:30'],
  notes: '',
  status: 'confirmed',
  createdAt: '2030-01-01T10:00:00.000Z',
};

describeResponseSchema('createdBookingSchema (POST /api/bookings)', createdBookingSchema, { ...BOOKING, cancelToken: 't' }, [
  '_id',
]);

describeResponseSchema('bookingListSchema (GET /api/bookings)', bookingListSchema, [BOOKING], [
  '0',
  '0._id',
  '0.client',
  '0.client.name',
  '0.date',
  '0.time',
  '0.status',
]);

describe('booking shapes the UI already tolerates', () => {
  it('accepts a legacy booking without professional, location, slots or phone', () => {
    const legacy = {
      _id: 'old',
      client: { name: 'Ana' },
      barber: { name: 'Barbero Viejo' },
      date: '2030-01-07',
      time: '10:00',
      status: 'pending',
    };
    expect(bookingListSchema.safeParse([legacy]).success).toBe(true);
  });

  it('accepts an empty list', () => {
    expect(bookingListSchema.parse([])).toEqual([]);
  });

  it('rejects a body that is not a list', () => {
    expect(bookingListSchema.safeParse({ bookings: [] }).success).toBe(false);
  });

  it('accepts a created booking without cancelToken', () => {
    expect(createdBookingSchema.safeParse({ _id: '1' }).success).toBe(true);
  });
});

describe('statisticsSchema (GET /api/bookings/statistics)', () => {
  it('accepts the three counters', () => {
    const stats = { totalBookings: 7, totalRevenue: 12500, todayBookings: 2 };
    expect(statisticsSchema.parse(stats)).toEqual(stats);
  });

  it('accepts an answer that omits the counters (the UI shows 0)', () => {
    expect(statisticsSchema.safeParse({}).success).toBe(true);
  });

  it('keeps a counter the backend adds later', () => {
    expect(statisticsSchema.parse({ totalBookings: 1, monthRevenue: 3 })).toEqual({ totalBookings: 1, monthRevenue: 3 });
  });

  it.each(['totalBookings', 'totalRevenue', 'todayBookings'])('rejects %s when it is not a number', (field) => {
    expect(statisticsSchema.safeParse({ [field]: 'many' }).success).toBe(false);
  });

  it('rejects a body that is not an object', () => {
    expect(statisticsSchema.safeParse([]).success).toBe(false);
  });
});
