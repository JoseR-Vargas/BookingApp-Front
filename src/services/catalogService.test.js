import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_CONFIG } from '../config/appConfig.js';
import { CATALOG } from '../test/catalogFixture.js';
import { getCatalog } from './catalogService.js';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => CATALOG }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('catalogService', () => {
  it('getCatalog => GET /api/catalog without auth headers', async () => {
    await getCatalog();

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${APP_CONFIG.BACKEND_URL}/api/catalog`);
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('returns the parsed catalog', async () => {
    expect(await getCatalog()).toEqual(CATALOG);
  });

  it('rejects when the backend fails', async () => {
    fetch.mockResolvedValue({ ok: false, status: 500, text: async () => '' });

    await expect(getCatalog()).rejects.toThrow('HTTP error! status: 500');
  });
});
