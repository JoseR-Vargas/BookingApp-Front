import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_CONFIG } from '../config/appConfig.js';
import { getPublicAvailability } from './publicAvailabilityService.js';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ enabled: false }) }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('publicAvailabilityService', () => {
  it('asks GET /api/public-availability without auth, and without serviceId when none is given', async () => {
    expect(await getPublicAvailability()).toEqual({ enabled: false });

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${APP_CONFIG.BACKEND_URL}/api/public-availability`);
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('sends the chosen service, encoded', async () => {
    await getPublicAvailability('corte & barba');

    expect(fetch.mock.calls[0][0]).toBe(`${APP_CONFIG.BACKEND_URL}/api/public-availability?serviceId=corte%20%26%20barba`);
  });

  it('rejects when the backend fails (404 for a service that is not published)', async () => {
    fetch.mockResolvedValue({ ok: false, status: 404, text: async () => '' });

    await expect(getPublicAvailability('nope')).rejects.toThrow();
  });
});
