import { afterEach, describe, it, expect } from 'vitest';
import { SCHEDULE } from '../test/catalogFixture.js';
import { getFallbackSchedule, setFallbackSchedule } from './schedule.js';

// 2030-01-06 is a Sunday, 2030-01-07 Monday, 2030-01-12 Saturday (local-date parsing).
const SUNDAY = '2030-01-06';
const MONDAY = '2030-01-07';
const SATURDAY = '2030-01-12';

describe('getFallbackSchedule', () => {
  it('is closed with no times on Sunday', () => {
    expect(getFallbackSchedule(SUNDAY, SCHEDULE)).toEqual({ closed: true, times: [] });
  });

  it('lists a start every 30 minutes from 09:00 to 19:30 on weekdays', () => {
    const { closed, times } = getFallbackSchedule(MONDAY, SCHEDULE);
    expect(closed).toBe(false);
    expect(times).toHaveLength(22);
    expect(times.slice(0, 4)).toEqual(['09:00', '09:30', '10:00', '10:30']);
    expect(times[times.length - 1]).toBe('19:30');
    expect(times).not.toContain('20:00');
  });

  it('runs continuously: 13:00 and 13:30 are starts too', () => {
    const { times } = getFallbackSchedule(MONDAY, SCHEDULE);
    expect(times).toContain('13:00');
    expect(times).toContain('13:30');
  });

  it('stops at 17:30 on Saturday', () => {
    const { times } = getFallbackSchedule(SATURDAY, SCHEDULE);
    expect(times[0]).toBe('09:00');
    expect(times[times.length - 1]).toBe('17:30');
    expect(times).not.toContain('18:00');
  });

  it('follows the hours the catalog reports for the day (HH:mm strings)', () => {
    const schedule = {
      weekly: { ...SCHEDULE.weekly, 1: { closed: false, open: '10:30', close: '12:00' } },
      slotIntervalMinutes: 30,
    };
    expect(getFallbackSchedule(MONDAY, schedule)).toEqual({ closed: false, times: ['10:30', '11:00', '11:30'] });
  });

  it('is closed when the catalog marks a weekday as closed', () => {
    const schedule = { weekly: { ...SCHEDULE.weekly, 6: { closed: true } }, slotIntervalMinutes: 30 };
    expect(getFallbackSchedule(SATURDAY, schedule)).toEqual({ closed: true, times: [] });
  });

  it('offers nothing when the schedule it is given has no entry for the day', () => {
    expect(getFallbackSchedule(MONDAY, null)).toEqual({ closed: true, times: [] });
    expect(getFallbackSchedule(MONDAY, { weekly: {} })).toEqual({ closed: true, times: [] });
  });
});

describe('getFallbackSchedule start interval', () => {
  const withInterval = (startIntervalMinutes) => ({ ...SCHEDULE, startIntervalMinutes });

  it('offers a start every `startIntervalMinutes` counted from the opening time', () => {
    expect(getFallbackSchedule(MONDAY, withInterval(180)).times).toEqual(['09:00', '12:00', '15:00', '18:00']);
    expect(getFallbackSchedule(SATURDAY, withInterval(180)).times).toEqual(['09:00', '12:00', '15:00']);
  });

  it('counts from an opening that is not on the hour', () => {
    const schedule = {
      weekly: { ...SCHEDULE.weekly, 1: { closed: false, open: '09:30', close: '12:30' } },
      slotIntervalMinutes: 30,
      startIntervalMinutes: 60,
    };
    expect(getFallbackSchedule(MONDAY, schedule).times).toEqual(['09:30', '10:30', '11:30']);
  });

  it('keeps the 30-minute grid when the catalog has no start interval (older catalog)', () => {
    expect(getFallbackSchedule(MONDAY, SCHEDULE).times).toHaveLength(22);
    expect(getFallbackSchedule(MONDAY, { ...SCHEDULE, startIntervalMinutes: undefined }).times).toHaveLength(22);
  });

  it('stays closed on a closed day whatever the interval', () => {
    expect(getFallbackSchedule(SUNDAY, withInterval(180))).toEqual({ closed: true, times: [] });
  });
});

describe('getFallbackSchedule starts per day', () => {
  const withMonday = (starts, startIntervalMinutes = 30) => ({
    ...SCHEDULE,
    startIntervalMinutes,
    weekly: { ...SCHEDULE.weekly, 1: { closed: false, open: '09:00', close: '20:00', starts } },
  });

  it('offers exactly the listed starts of a day, whatever the interval', () => {
    expect(getFallbackSchedule(MONDAY, withMonday(['09:00', '12:00', '16:30'], 180)).times).toEqual(['09:00', '12:00', '16:30']);
  });

  it('keeps the interval rule for the days without a list', () => {
    expect(getFallbackSchedule(SATURDAY, withMonday(['10:00'], 180)).times).toEqual(['09:00', '12:00', '15:00']);
    expect(getFallbackSchedule(MONDAY, withMonday(undefined, 180)).times).toEqual(['09:00', '12:00', '15:00', '18:00']);
  });
});

describe('setFallbackSchedule', () => {
  afterEach(() => setFallbackSchedule(null));

  it('makes the catalog schedule the one the fallback grid uses when none is passed', () => {
    setFallbackSchedule({ weekly: { ...SCHEDULE.weekly, 1: { closed: false, open: '10:00', close: '11:00' } }, slotIntervalMinutes: 30 });

    expect(getFallbackSchedule(MONDAY)).toEqual({ closed: false, times: ['10:00', '10:30'] });
    expect(getFallbackSchedule(SATURDAY).times.at(-1)).toBe('17:30');
  });

  it('follows a catalog that closes a weekday', () => {
    setFallbackSchedule({ weekly: { ...SCHEDULE.weekly, 6: { closed: true } }, slotIntervalMinutes: 30 });

    expect(getFallbackSchedule(SATURDAY)).toEqual({ closed: true, times: [] });
  });

  it('before any catalog is known keeps the historical business hours (Mon-Fri 09-20, Sat 09-18, Sun closed)', () => {
    expect(getFallbackSchedule(MONDAY).times).toHaveLength(22);
    expect(getFallbackSchedule(SATURDAY).times.at(-1)).toBe('17:30');
    expect(getFallbackSchedule(SUNDAY)).toEqual({ closed: true, times: [] });
  });
});
