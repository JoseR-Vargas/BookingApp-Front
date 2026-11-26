import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiClient } from '../apiClient.js';
import { installMockHttp, restoreHttp } from '../../test/mockHttp.js';

const ok = () => ({ ok: true, status: 200, json: async () => ({}) });

afterEach(() => {
  restoreHttp();
  window.history.pushState({}, '', '/');
});

describe('X-Tenant header', () => {
  it('is not sent from the default business', async () => {
    const mock = installMockHttp(vi.fn(ok));
    await apiClient.get('/api/catalog');
    expect(mock.mock.calls[0][1].headers['X-Tenant']).toBeUndefined();
  });

  it('is sent on every request from a business route', async () => {
    window.history.pushState({}, '', '/n/sur/admin');
    const mock = installMockHttp(vi.fn(ok));
    await apiClient.get('/api/catalog');
    await apiClient.post('/api/bookings', { a: 1 });
    await apiClient.get('/api/admin/bookings', { headers: { Authorization: 'Bearer k' } });
    for (const call of mock.mock.calls) {
      expect(call[1].headers['X-Tenant']).toBe('sur');
    }
    expect(mock.mock.calls[2][1].headers.Authorization).toBe('Bearer k');
  });
});
