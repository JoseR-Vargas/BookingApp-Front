import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../core/apiClient.js', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

import { apiClient } from '../core/apiClient.js';
import { cancelByToken, getCancellation } from './cancellationService.js';

const TOKEN = 'abcDEF123_-abcDEF123_-abcDEF123_-abcDEF1234';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cancellationService', () => {
  it('getCancellation reads the public summary by token', async () => {
    apiClient.get.mockResolvedValue({ state: 'cancellable' });

    await expect(getCancellation(TOKEN)).resolves.toEqual({ state: 'cancellable' });
    expect(apiClient.get).toHaveBeenCalledWith(`/api/bookings/cancel/${TOKEN}`);
  });

  it('cancelByToken posts to the same URL without a body and without any admin key', async () => {
    apiClient.post.mockResolvedValue({ state: 'cancelled' });

    await expect(cancelByToken(TOKEN)).resolves.toEqual({ state: 'cancelled' });
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    const [path, body, options] = apiClient.post.mock.calls[0];
    expect(path).toBe(`/api/bookings/cancel/${TOKEN}`);
    expect(body).toBeNull();
    expect(options?.headers?.Authorization).toBeUndefined();
  });

  it('encodes the token so a crafted URL cannot reach another route', async () => {
    apiClient.get.mockResolvedValue({});

    await getCancellation('../admin/catalog?x=1');

    expect(apiClient.get).toHaveBeenCalledWith(
      `/api/bookings/cancel/${encodeURIComponent('../admin/catalog?x=1')}`,
    );
  });

  it('lets the HTTP status of a failure reach the caller', async () => {
    const error = Object.assign(new Error('Reserva no encontrada'), { status: 404 });
    apiClient.get.mockRejectedValue(error);

    await expect(getCancellation(TOKEN)).rejects.toBe(error);
  });
});
