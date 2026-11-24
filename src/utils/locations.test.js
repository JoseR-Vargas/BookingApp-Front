import { describe, expect, it } from 'vitest';
import { SCHEDULE } from '../test/catalogFixture.js';
import { activeLocations, catalogLocations, locationLabel } from './locations.js';

describe('catalogLocations', () => {
  it('is one default "principal" location built from the top-level schedule when the catalog has none', () => {
    expect(catalogLocations({ schedule: SCHEDULE })).toEqual([
      { id: 'principal', name: 'Principal', address: '', active: true, schedule: SCHEDULE },
    ]);
    expect(catalogLocations(null)).toHaveLength(1);
    expect(catalogLocations({ locations: [], schedule: SCHEDULE })).toHaveLength(1);
  });

  it('returns the locations of the catalog when it has them', () => {
    const locations = [{ id: 'a', name: 'A', active: true }, { id: 'b', name: 'B', active: false }];
    expect(catalogLocations({ locations })).toBe(locations);
  });
});

describe('activeLocations', () => {
  it('drops the inactive ones, and treats a missing `active` as active', () => {
    const locations = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', active: false }, { id: 'c', name: 'C', active: true }];
    expect(activeLocations({ locations }).map((l) => l.id)).toEqual(['a', 'c']);
  });
});

describe('locationLabel', () => {
  it('adds the address when there is one', () => {
    expect(locationLabel({ name: 'Centro', address: 'Av. 18 de Julio 1234' })).toBe('Centro — Av. 18 de Julio 1234');
    expect(locationLabel({ name: 'Centro', address: '' })).toBe('Centro');
    expect(locationLabel({ name: 'Centro' })).toBe('Centro');
  });
});
