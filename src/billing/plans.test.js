import { describe, it, expect } from 'vitest';
import { PLANS, STATUS_LABELS, planName } from './plans.js';

describe('plans', () => {
  it('lists the plans from the smallest to the biggest', () => {
    expect(PLANS.map((plan) => plan.id)).toEqual(['gratis', 'pro', 'negocio']);
    const bookings = PLANS.map((plan) => plan.limits.bookingsPerMonth);
    expect([...bookings].sort((a, b) => a - b)).toEqual(bookings);
  });

  it('has a label for every subscription status', () => {
    expect(Object.keys(STATUS_LABELS)).toEqual(['trialing', 'active', 'past_due', 'canceled']);
  });

  it('names a plan, and falls back to its id', () => {
    expect(planName('pro')).toBe('Pro');
    expect(planName('x')).toBe('x');
  });
});
