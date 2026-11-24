import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_CONFIG } from '../config/appConfig.js';
import { brandLogoSrc, getBranding } from './brandingService.js';
import { installMockHttp, restoreHttp } from '../test/mockHttp.js';
import { ContractError } from '../schemas/contract-error.js';

let httpMock;

const BRANDING = {
  businessName: 'Barbería Don Pepe',
  colors: { accent: '#c9a96e', background: '#0d0d0d', text: '#f5f0e8', button: null },
  logoUrl: '/api/branding/logo?v=1763300000000',
};

beforeEach(() => {
  httpMock = installMockHttp(vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => BRANDING }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  restoreHttp();
});

describe('brandingService', () => {
  it('getBranding => GET /api/branding without auth headers', async () => {
    expect(await getBranding()).toEqual(BRANDING);

    const [url, init] = httpMock.mock.calls[0];
    expect(url).toBe(`${APP_CONFIG.BACKEND_URL}/api/branding`);
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('brandLogoSrc points the backend-relative logo URL at the backend', () => {
    expect(brandLogoSrc(BRANDING.logoUrl)).toBe(`${APP_CONFIG.BACKEND_URL}/api/branding/logo?v=1763300000000`);
    expect(brandLogoSrc(null)).toBeNull();
  });
});

describe('brandingService response contract', () => {
  it('rejects with a ContractError when the colors are missing', async () => {
    const { colors, ...incomplete } = BRANDING;
    httpMock.mockResolvedValue({ ok: true, status: 200, json: async () => incomplete });

    await expect(getBranding()).rejects.toBeInstanceOf(ContractError);
  });
});
