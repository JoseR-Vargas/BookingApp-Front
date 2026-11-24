import { describe, expect, it } from 'vitest';
import { dayLabel } from './publicAvailability.js';

describe('dayLabel', () => {
  it('names the weekday, day and month', () => {
    expect(dayLabel('2030-01-07')).toBe('Lunes 7 ene');
    expect(dayLabel('2030-01-13')).toBe('Domingo 13 ene');
    expect(dayLabel('2030-12-31')).toBe('Martes 31 dic');
  });

  it('adds "Hoy" or "Mañana" in front of the first two days', () => {
    expect(dayLabel('2030-01-07', '2030-01-07')).toBe('Hoy · Lunes 7 ene');
    expect(dayLabel('2030-01-08', '2030-01-07')).toBe('Mañana · Martes 8 ene');
    expect(dayLabel('2030-01-09', '2030-01-07')).toBe('Miércoles 9 ene');
  });

  it('rolls over months for "Mañana"', () => {
    expect(dayLabel('2030-02-01', '2030-01-31')).toBe('Mañana · Viernes 1 feb');
  });
});
