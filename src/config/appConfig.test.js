import { describe, it, expect, afterEach, vi } from 'vitest';

// APP_CONFIG resolves BACKEND_URL at module evaluation time, so each case
// stubs the location and re-imports a fresh copy of the module.
async function loadConfigFor(hostname) {
  vi.stubGlobal('location', { hostname });
  vi.resetModules();
  const mod = await import('./appConfig.js');
  return mod.APP_CONFIG;
}

describe('APP_CONFIG.BACKEND_URL', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the local backend for localhost', async () => {
    const config = await loadConfigFor('localhost');
    expect(config.BACKEND_URL).toBe('http://localhost:3000');
  });

  it('uses the local backend for 127.0.0.1', async () => {
    const config = await loadConfigFor('127.0.0.1');
    expect(config.BACKEND_URL).toBe('http://localhost:3000');
  });

  it('uses the Vercel backend for the production hostname', async () => {
    const config = await loadConfigFor('booking-app-front-peach.vercel.app');
    expect(config.BACKEND_URL).toBe('https://booking-app-back.vercel.app');
  });

  it('uses the Vercel backend for any other hostname', async () => {
    const config = await loadConfigFor('192.168.1.20');
    expect(config.BACKEND_URL).toBe('https://booking-app-back.vercel.app');
  });
});

describe('APP_CONFIG scalar settings', () => {
  it('keeps the scalar settings identical to legacy', async () => {
    const config = await loadConfigFor('localhost');
    expect(config.TOAST_DURATION).toBe(3000);
    expect(config.ITEMS_PER_PAGE).toBe(10);
  });

  it('no longer carries the 5-hour rule: the backend owns the one-minute cutoff', async () => {
    const config = await loadConfigFor('localhost');
    expect(config).not.toHaveProperty('CANCELLATION_HOURS');
  });

  it('no longer carries business data: the backend catalog owns it', async () => {
    const config = await loadConfigFor('localhost');
    expect(config).not.toHaveProperty('PROFESSIONALS');
    expect(config).not.toHaveProperty('SERVICES');
    expect(config).not.toHaveProperty('BUSINESS_HOURS');
  });
});
