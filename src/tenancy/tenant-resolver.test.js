import { describe, it, expect } from 'vitest';
import { parseTenantPath, currentTenantSlug } from './tenant-resolver.js';
import { tenantPath } from './tenant-link.js';
import { sessionKey } from './tenant-storage.js';

describe('parseTenantPath', () => {
  it.each([
    ['/', null],
    ['/disponibilidad', null],
    ['/admin', null],
    ['/cancelar/abc', null],
    ['/n/sur', 'sur'],
    ['/n/sur/', 'sur'],
    ['/n/barberia-sur/admin', 'barberia-sur'],
    ['/n/Sur/disponibilidad', 'sur'],
  ])('%s -> %s', (path, slug) => {
    expect(parseTenantPath(path)).toBe(slug);
  });

  it('ignores a slug with a wrong shape', () => {
    expect(parseTenantPath('/n/a')).toBeNull();
    expect(parseTenantPath('/n/-bad-/admin')).toBeNull();
    expect(parseTenantPath('/n/has space')).toBeNull();
  });

  it('reads the slug of the address bar', () => {
    window.history.pushState({}, '', '/n/norte/admin');
    expect(currentTenantSlug()).toBe('norte');
    window.history.pushState({}, '', '/');
    expect(currentTenantSlug()).toBeNull();
  });
});

describe('tenantPath', () => {
  it('keeps the plain path for the default business', () => {
    expect(tenantPath(null, '/admin')).toBe('/admin');
    expect(tenantPath(null, '/')).toBe('/');
  });

  it('prefixes the business route', () => {
    expect(tenantPath('sur', '/admin')).toBe('/n/sur/admin');
    expect(tenantPath('sur', '/')).toBe('/n/sur');
  });
});

describe('sessionKey', () => {
  it('keeps the legacy key for the default business and scopes the others', () => {
    expect(sessionKey('adminKey', null)).toBe('adminKey');
    expect(sessionKey('adminKey', 'sur')).toBe('adminKey:sur');
  });
});
