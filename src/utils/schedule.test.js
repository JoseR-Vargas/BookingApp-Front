import { describe, it, expect } from 'vitest';
import { getFallbackSchedule } from './schedule.js';

// 2030-01-06 is a Sunday, 2030-01-07 Monday, 2030-01-12 Saturday (local-date parsing).
const SUNDAY = '2030-01-06';
const MONDAY = '2030-01-07';
const SATURDAY = '2030-01-12';

describe('getFallbackSchedule', () => {
  it('is closed with no times on Sunday', () => {
    expect(getFallbackSchedule(SUNDAY)).toEqual({ closed: true, times: [] });
  });

  it('lists a start every 30 minutes from 09:00 to 19:30 on weekdays', () => {
    const { closed, times } = getFallbackSchedule(MONDAY);
    expect(closed).toBe(false);
    expect(times).toHaveLength(22);
    expect(times.slice(0, 4)).toEqual(['09:00', '09:30', '10:00', '10:30']);
    expect(times[times.length - 1]).toBe('19:30');
    expect(times).not.toContain('20:00');
  });

  it('runs continuously: 13:00 and 13:30 are starts too', () => {
    const { times } = getFallbackSchedule(MONDAY);
    expect(times).toContain('13:00');
    expect(times).toContain('13:30');
  });

  it('stops at 17:30 on Saturday', () => {
    const { times } = getFallbackSchedule(SATURDAY);
    expect(times[0]).toBe('09:00');
    expect(times[times.length - 1]).toBe('17:30');
    expect(times).not.toContain('18:00');
  });
});
