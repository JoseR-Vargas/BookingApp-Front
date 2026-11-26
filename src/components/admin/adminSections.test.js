import { describe, it, expect } from 'vitest';
import { canConfigure, canWriteBookings, navItemsFor } from './adminSections.js';

describe('roles of the admin panel (spec 20)', () => {
  it('only the owner configures the business', () => {
    expect(canConfigure('owner')).toBe(true);
    expect(canConfigure('staff')).toBe(false);
    expect(canConfigure('viewer')).toBe(false);
  });

  it('owner and staff write bookings, the viewer only reads', () => {
    expect(canWriteBookings('owner')).toBe(true);
    expect(canWriteBookings('staff')).toBe(true);
    expect(canWriteBookings('viewer')).toBe(false);
  });

  it('hides the configuration from staff and viewers', () => {
    const sections = (role) => navItemsFor(role).map((item) => item.section);
    expect(sections('owner')).toContain('config');
    expect(sections('staff')).toEqual(['dashboard', 'bookings', 'reports']);
    expect(sections('viewer')).toEqual(['dashboard', 'bookings', 'reports']);
  });
});
