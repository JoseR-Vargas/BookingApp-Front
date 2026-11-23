import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_CONFIG } from '../config/appConfig.js';
import { getPublicAvailability } from './publicAvailabilityService.js';
import { installMockHttp, restoreHttp } from '../test/mockHttp.js';
import { ContractError } from '../schemas/contract-error.js';

let httpMock;

beforeEach(() => {
  httpMock = installMockHttp(vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ enabled: false }) }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  restoreHttp();
});

describe('publicAvailabilityService', () => {
  it('asks GET /api/public-availability without auth, and without serviceId when none is given', async () => {
    expect(await getPublicAvailability()).toEqual({ enabled: false });

    const [url, init] = httpMock.mock.calls[0];
    expect(url).toBe(`${APP_CONFIG.BACKEND_URL}/api/public-availability`);
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('sends the chosen service, encoded', async () => {
    await getPublicAvailability('corte & barba');

    expect(httpMock.mock.calls[0][0]).toBe(`${APP_CONFIG.BACKEND_URL}/api/public-availability?serviceId=corte%20%26%20barba`);
  });

  it('sends the chosen location too (SPEC 08), with or without a service', async () => {
    await getPublicAvailability('corte', 'centro');
    await getPublicAvailability(undefined, 'centro');

    expect(httpMock.mock.calls[0][0]).toBe(`${APP_CONFIG.BACKEND_URL}/api/public-availability?serviceId=corte&locationId=centro`);
    expect(httpMock.mock.calls[1][0]).toBe(`${APP_CONFIG.BACKEND_URL}/api/public-availability?locationId=centro`);
  });

  it('rejects when the backend fails (404 for a service that is not published)', async () => {
    httpMock.mockResolvedValue({ ok: false, status: 404, text: async () => '' });

    await expect(getPublicAvailability('nope')).rejects.toThrow();
  });
});

describe('publicAvailabilityService response contract', () => {
  it('rejects with a ContractError when the answer has no enabled flag', async () => {
    httpMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ days: [] }) });

    await expect(getPublicAvailability()).rejects.toBeInstanceOf(ContractError);
  });

  it('rejects with a ContractError when an enabled answer lacks its days', async () => {
    httpMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ enabled: true, services: [] }) });

    await expect(getPublicAvailability()).rejects.toBeInstanceOf(ContractError);
  });
});
