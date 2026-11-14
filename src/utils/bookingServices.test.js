import { describe, it, expect } from 'vitest';
import {
  getBookingServices,
  getServiceNames,
  getBookingTotalPrice,
  getBookingTotalDuration,
} from './bookingServices.js';

const booking = {
  services: [
    { id: 'a', name: 'Consulta Inicial', price: 500, duration: 60 },
    { id: 'b', name: 'Servicio Básico', price: 1200, duration: 60 },
  ],
  totalPrice: 1700,
  totalDuration: 120,
};

describe('getBookingServices', () => {
  it('returns the service lines of the booking', () => {
    expect(getBookingServices(booking)).toBe(booking.services);
  });

  it('is an empty list when the booking has no services', () => {
    expect(getBookingServices({})).toEqual([]);
    expect(getBookingServices(null)).toEqual([]);
  });
});

describe('getServiceNames', () => {
  it('lists every service name in booking order, skipping lines without name', () => {
    expect(getServiceNames(booking)).toEqual(['Consulta Inicial', 'Servicio Básico']);
    expect(getServiceNames({ services: [{ id: 'x' }, { name: 'Corte' }] })).toEqual(['Corte']);
  });
});

describe('getBookingTotalPrice / getBookingTotalDuration', () => {
  it('read the stored totals', () => {
    expect(getBookingTotalPrice(booking)).toBe(1700);
    expect(getBookingTotalDuration(booking)).toBe(120);
  });

  it('default to 0 when the totals are missing', () => {
    expect(getBookingTotalPrice({})).toBe(0);
    expect(getBookingTotalDuration(undefined)).toBe(0);
  });
});
