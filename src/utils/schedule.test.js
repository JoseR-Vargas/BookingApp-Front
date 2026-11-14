import { describe, it, expect } from 'vitest';
import { getDayInfo, buildTimeSlots, getUnavailableTimes } from './schedule.js';

// 2030-01-06 is a Sunday, 2030-01-07 Monday, 2030-01-12 Saturday (local-date parsing).
const SUNDAY = '2030-01-06';
const MONDAY = '2030-01-07';
const SATURDAY = '2030-01-12';

const values = (info) => info.slots.map((s) => s.value);

describe('getDayInfo', () => {
  it('marks Sunday as closed', () => {
    expect(getDayInfo(SUNDAY)).toMatchObject({ closed: true, closedLabel: 'Domingo cerrado' });
  });

  it('closes Saturday at 18 and weekdays at the configured end hour', () => {
    expect(getDayInfo(SATURDAY)).toMatchObject({ closed: false, closingHour: 18 });
    expect(getDayInfo(MONDAY)).toMatchObject({ closed: false, closingHour: 20 });
  });
});

describe('buildTimeSlots', () => {
  it('returns no slots and the closed label on Sunday', () => {
    const info = buildTimeSlots(SUNDAY);
    expect(info.closed).toBe(true);
    expect(info.closedLabel).toBe('Domingo cerrado');
    expect(info.slots).toEqual([]);
  });

  it('ends at 17:00 on Saturday', () => {
    const slots = values(buildTimeSlots(SATURDAY));
    expect(slots[slots.length - 1]).toBe('17:00');
    expect(slots).not.toContain('18:00');
  });

  it('ends at 19:00 on weekdays and starts at 09:00', () => {
    const slots = values(buildTimeSlots(MONDAY));
    expect(slots[0]).toBe('09:00');
    expect(slots[slots.length - 1]).toBe('19:00');
    expect(slots).not.toContain('20:00');
  });

  it('runs continuously: every hour from 09:00 to 19:00 is a slot, 13:00 included', () => {
    expect(values(buildTimeSlots(MONDAY))).toEqual([
      '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00',
    ]);
  });

  it('flags booked times and counts the available ones', () => {
    const info = buildTimeSlots(MONDAY, ['09:00', '15:00']);
    const total = info.slots.length;
    expect(info.slots.find((s) => s.value === '09:00').booked).toBe(true);
    expect(info.slots.find((s) => s.value === '15:00').booked).toBe(true);
    expect(info.slots.find((s) => s.value === '10:00').booked).toBe(false);
    expect(info.availableCount).toBe(total - 2);
    expect(info.headerText).toBe(`Selecciona una hora (${total - 2} disponibles)`);
  });

  it('reports no availability when every slot is booked', () => {
    const all = values(buildTimeSlots(MONDAY));
    const info = buildTimeSlots(MONDAY, all);
    expect(info.availableCount).toBe(0);
    expect(info.headerText).toBe('No hay horarios disponibles');
  });

  it('uses the plain header with all slots free when bookings are unknown (null)', () => {
    const info = buildTimeSlots(MONDAY, null);
    expect(info.headerText).toBe('Selecciona una hora');
    expect(info.slots.every((s) => s.booked === false)).toBe(true);
    expect(info.availableCount).toBe(info.slots.length);
  });

  it('treats an omitted bookedTimes as an empty list', () => {
    const info = buildTimeSlots(MONDAY);
    expect(info.headerText).toBe(`Selecciona una hora (${info.slots.length} disponibles)`);
  });
});

describe('getUnavailableTimes', () => {
  it('is every grid time that is not in the free list', () => {
    expect(getUnavailableTimes(MONDAY, ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']))
      .toEqual(['18:00', '19:00']);
  });

  it('marks the whole day when the professional has no free start time', () => {
    expect(getUnavailableTimes(MONDAY, [])).toEqual(values(buildTimeSlots(MONDAY)));
  });

  it('ignores free times that are outside the grid and has nothing to flag on a closed day', () => {
    expect(getUnavailableTimes(MONDAY, ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00']))
      .toEqual([]);
    expect(getUnavailableTimes(SUNDAY, [])).toEqual([]);
  });

  it('feeds buildTimeSlots so a window that does not fit shows as booked', () => {
    const free = ['09:00', '10:00', '14:00'];
    const info = buildTimeSlots(MONDAY, getUnavailableTimes(MONDAY, free));
    expect(info.slots.filter((slot) => !slot.booked).map((slot) => slot.value)).toEqual(free);
    expect(info.headerText).toBe('Selecciona una hora (3 disponibles)');
  });
});
