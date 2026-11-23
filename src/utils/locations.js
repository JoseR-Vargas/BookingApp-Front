// ===== LOCALES =====
// Helpers for the locations of a business (SPEC 08). A catalog that carries no `locations` (an older
// backend, or a business that never added one) behaves as ONE location, the default "principal",
// whose schedule is the catalog's top-level `schedule`: single-location screens do not change.

export const DEFAULT_LOCATION_ID = 'principal';

/** Every location of an admin or public catalog, always at least one. */
export function catalogLocations(catalog) {
  if (catalog && Array.isArray(catalog.locations) && catalog.locations.length > 0) return catalog.locations;
  return [{
    id: DEFAULT_LOCATION_ID,
    name: 'Principal',
    address: '',
    active: true,
    schedule: (catalog && catalog.schedule) || null,
  }];
}

/** Active locations only (the public catalog already sends just those). */
export const activeLocations = (catalog) => catalogLocations(catalog).filter((location) => location.active !== false);

/** 'Centro — Av. 18 de Julio 1234' (the address is optional). */
export const locationLabel = (location) => (location.address ? `${location.name} — ${location.address}` : location.name);
