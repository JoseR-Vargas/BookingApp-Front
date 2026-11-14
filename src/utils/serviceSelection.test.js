import { describe, expect, it } from 'vitest';
import {
  canAddService,
  getCommonProfessionalIds,
  getServiceIds,
  getTotalDuration,
  getTotalPrice,
  offersAllServices,
  toggleService,
} from './serviceSelection.js';

const BASIC = { id: 'basic', price: 1200, duration: 60, professionals: ['alex', 'maria'] };
const PREMIUM = { id: 'premium', price: 2500, duration: 90, professionals: ['alex', 'maria'] };
const EXPRESS = { id: 'express', price: 700, duration: 20, professionals: ['maria'] };
const ALEX_ONLY = { id: 'alex-only', price: 100, duration: 30, professionals: ['alex'] };

describe('getTotalPrice / getTotalDuration', () => {
  it('sum every selected service', () => {
    expect(getTotalPrice([BASIC, PREMIUM, EXPRESS])).toBe(4400);
    expect(getTotalDuration([BASIC, PREMIUM, EXPRESS])).toBe(170);
  });

  it('are zero for an empty selection', () => {
    expect(getTotalPrice([])).toBe(0);
    expect(getTotalDuration([])).toBe(0);
  });
});

describe('getServiceIds', () => {
  it('keeps the selection order', () => {
    expect(getServiceIds([PREMIUM, BASIC])).toEqual(['premium', 'basic']);
  });
});

describe('toggleService', () => {
  it('adds a service that is not selected yet', () => {
    expect(toggleService([BASIC], PREMIUM)).toEqual([BASIC, PREMIUM]);
  });

  it('removes a service that is already selected (by id)', () => {
    expect(toggleService([BASIC, PREMIUM], { ...BASIC })).toEqual([PREMIUM]);
  });

  it('does not mutate the previous selection', () => {
    const selection = [BASIC];
    toggleService(selection, PREMIUM);
    expect(selection).toEqual([BASIC]);
  });
});

describe('getCommonProfessionalIds', () => {
  it('is the intersection of the professionals of every service', () => {
    expect(getCommonProfessionalIds([BASIC, EXPRESS])).toEqual(['maria']);
    expect(getCommonProfessionalIds([BASIC, PREMIUM])).toEqual(['alex', 'maria']);
  });

  it('is empty when no professional offers every service', () => {
    expect(getCommonProfessionalIds([ALEX_ONLY, EXPRESS])).toEqual([]);
  });

  it('is empty for an empty selection', () => {
    expect(getCommonProfessionalIds([])).toEqual([]);
  });
});

describe('offersAllServices', () => {
  it('is true only when the professional offers every selected service', () => {
    expect(offersAllServices('maria', [BASIC, EXPRESS])).toBe(true);
    expect(offersAllServices('alex', [BASIC, EXPRESS])).toBe(false);
  });
});

describe('canAddService', () => {
  it('allows a service that keeps at least one common professional', () => {
    expect(canAddService([BASIC], EXPRESS)).toBe(true);
    expect(canAddService([], ALEX_ONLY)).toBe(true);
  });

  it('refuses a service that would leave no common professional', () => {
    expect(canAddService([ALEX_ONLY], EXPRESS)).toBe(false);
  });
});
