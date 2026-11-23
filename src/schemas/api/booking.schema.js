// ===== BOOKING RESPONSES =====
// The created booking, the admin list and the statistics. Old bookings lack fields (professional,
// location, slots, phone) and the admin table already copes with that, so only what every booking
// has is required.

import { z } from 'zod';

const booking = z.looseObject({
  _id: z.string(),
  client: z.looseObject({ name: z.string() }),
  date: z.string(),
  time: z.string(),
  status: z.string(),
});

// POST /api/bookings: the stored booking plus the one-time cancelToken. The UI only needs the id.
export const createdBookingSchema = z.looseObject({
  _id: z.string(),
  cancelToken: z.string().optional(),
});

export const bookingListSchema = z.array(booking);

// A counter the backend omits is shown as 0.
export const statisticsSchema = z.looseObject({
  totalBookings: z.number().optional(),
  totalRevenue: z.number().optional(),
  todayBookings: z.number().optional(),
});
