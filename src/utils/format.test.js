import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatPrice,
  formatDate,
  formatBookingDate,
  formatLongDateUTC,
  formatMoney,
} from './format.js';
import * as format from './format.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('format', () => {
  it('formatPrice uses es-UY / UYU currency formatting', () => {
    const expected = new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU' }).format(1200);
    expect(formatPrice(1200)).toBe(expected);
  });

  it('formatDate uses the es-ES long format', () => {
    const expected = new Date('2030-01-07T12:00:00').toLocaleDateString('es-ES', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    expect(formatDate('2030-01-07T12:00:00')).toBe(expected);
  });

  it('formatBookingDate builds a LOCAL date (no day shift) with the short es-ES format', () => {
    const expected = new Date(2030, 0, 7).toLocaleDateString('es-ES', {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    });
    expect(formatBookingDate('2030-01-07')).toBe(expected);
    expect(formatBookingDate('2030-01-07')).toMatch(/7/);
  });

  it('formatLongDateUTC builds a UTC date and formats it in UTC', () => {
    expect(formatLongDateUTC('2030-01-07')).toBe(
      new Date(Date.UTC(2030, 0, 7)).toLocaleDateString('es-ES', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
      })
    );
    expect(formatLongDateUTC('2030-01-07')).toMatch(/lunes/);
  });

  it('formatMoney prefixes "$" to the locale string and tolerates empty values', () => {
    expect(formatMoney(1200)).toBe('$' + (1200).toLocaleString());
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(undefined)).toBe('$0');
  });

  it('no longer exports the client-side 5-hour cancel rule', () => {
    expect(format).not.toHaveProperty('canCancelBooking');
  });
});
