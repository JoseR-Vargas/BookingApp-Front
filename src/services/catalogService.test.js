import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_CONFIG } from '../config/appConfig.js';
import { CATALOG } from '../test/catalogFixture.js';
import { getCatalog } from './catalogService.js';
import { installMockHttp, restoreHttp } from '../test/mockHttp.js';
import { ContractError } from '../schemas/contract-error.js';

let httpMock;

beforeEach(() => {
  httpMock = installMockHttp(vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => CATALOG }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  restoreHttp();
});

describe('catalogService', () => {
  it('getCatalog => GET /api/catalog without auth headers', async () => {
    await getCatalog();

    const [url, init] = httpMock.mock.calls[0];
    expect(url).toBe(`${APP_CONFIG.BACKEND_URL}/api/catalog`);
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('returns the parsed catalog', async () => {
    expect(await getCatalog()).toEqual(CATALOG);
  });

  it('rejects when the backend fails', async () => {
    httpMock.mockResolvedValue({ ok: false, status: 500, text: async () => '' });

    await expect(getCatalog()).rejects.toThrow('HTTP error! status: 500');
  });
});

describe('catalogService response contract', () => {
  it('rejects with a ContractError when a required field is missing', async () => {
    const { schedule, ...incomplete } = CATALOG;
    httpMock.mockResolvedValue({ ok: true, status: 200, json: async () => incomplete });

    await expect(getCatalog()).rejects.toBeInstanceOf(ContractError);
    await expect(getCatalog()).rejects.toThrow('La respuesta del servidor no tiene el formato esperado.');
  });

  it('rejects with a ContractError when a field has another type', async () => {
    httpMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ...CATALOG, services: 'none' }) });

    await expect(getCatalog()).rejects.toBeInstanceOf(ContractError);
  });

  it('accepts and returns a field the backend added later', async () => {
    const withNewField = { ...CATALOG, brandNew: true };
    httpMock.mockResolvedValue({ ok: true, status: 200, json: async () => withNewField });

    expect(await getCatalog()).toEqual(withNewField);
  });
});
