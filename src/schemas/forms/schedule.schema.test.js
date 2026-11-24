import { describe, expect, it } from 'vitest';
import { validate } from '../validate.js';
import { scheduleFormSchema } from './schedule.schema.js';

const day = (name, overrides = {}) => ({ name, closed: false, open: '09:00', close: '18:00', starts: null, ...overrides });
const week = (overrides = {}) => [
  day('Lunes'),
  day('Martes'),
  day('Domingo', { closed: true }),
].map((item) => ({ ...item, ...(overrides[item.name] || {}) }));

describe('scheduleFormSchema', () => {
  it('accepts a week with a closed day and a day with its own start times', () => {
    expect(validate(scheduleFormSchema, week({ Martes: { starts: ['09:00'] } }))).toBeNull();
  });

  it('rejects an opening that is not before the closing, naming the day', () => {
    expect(validate(scheduleFormSchema, week({ Martes: { open: '18:00', close: '09:00' } })))
      .toBe('Martes: la apertura debe ser anterior al cierre');
    expect(validate(scheduleFormSchema, week({ Lunes: { open: '09:00', close: '09:00' } })))
      .toBe('Lunes: la apertura debe ser anterior al cierre');
  });

  it('ignores the hours of a closed day', () => {
    expect(validate(scheduleFormSchema, week({ Domingo: { open: '18:00', close: '09:00' } }))).toBeNull();
  });

  it('rejects an empty list of own start times, naming the day', () => {
    expect(validate(scheduleFormSchema, week({ Martes: { starts: [] } })))
      .toBe('Martes: marca al menos una hora o usa el intervalo general');
  });

  it('reports the first day with a bad range, before any empty list (same order as before)', () => {
    const days = week({ Lunes: { starts: [] }, Martes: { open: '18:00', close: '09:00' } });
    expect(validate(scheduleFormSchema, days)).toBe('Martes: la apertura debe ser anterior al cierre');
  });

  it('reports the first of several bad ranges', () => {
    const days = week({ Lunes: { open: '18:00', close: '09:00' }, Martes: { open: '18:00', close: '09:00' } });
    expect(validate(scheduleFormSchema, days)).toBe('Lunes: la apertura debe ser anterior al cierre');
  });
});
