import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from './apiClient.js';
import { APP_CONFIG } from '../config/appConfig.js';
import { installMockHttp, restoreHttp } from '../test/mockHttp.js';

// Minimal fetch Response double: `text` is what response.text() resolves to.
function mockResponse({ ok = true, status = 200, json = {}, text = '' } = {}) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(json),
    text: vi.fn().mockResolvedValue(text),
  };
}

describe('apiClient', () => {
  let http;

  beforeEach(() => {
    http = installMockHttp(() => mockResponse());
  });

  afterEach(() => {
    restoreHttp();
    vi.restoreAllMocks();
  });

  describe('request building', () => {
    it('builds the URL as BACKEND_URL + path', async () => {
      http.mockResolvedValue(mockResponse());
      await apiClient.get('/api/bookings');
      expect(http).toHaveBeenCalledTimes(1);
      expect(http.mock.calls[0][0]).toBe(`${APP_CONFIG.BACKEND_URL}/api/bookings`);
    });

    it('POST sends a JSON body and the JSON Content-Type header', async () => {
      http.mockResolvedValue(mockResponse());
      const body = { client: { name: 'Ana' }, time: '10:00' };
      await apiClient.post('/api/bookings', body);

      const [, init] = http.mock.calls[0];
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify(body));
      expect(init.headers['Content-Type']).toBe('application/json');
    });

    it('GET sends no body and no Content-Type header', async () => {
      http.mockResolvedValue(mockResponse());
      await apiClient.get('/api/bookings');

      const [, init] = http.mock.calls[0];
      expect(init.method).toBe('GET');
      expect(init.body).toBeUndefined();
      expect(init.headers['Content-Type']).toBeUndefined();
    });

    it('DELETE uses the DELETE method with no body', async () => {
      http.mockResolvedValue(mockResponse());
      await apiClient.delete('/api/bookings/abc123');

      const [url, init] = http.mock.calls[0];
      expect(url).toBe(`${APP_CONFIG.BACKEND_URL}/api/bookings/abc123`);
      expect(init.method).toBe('DELETE');
      expect(init.body).toBeUndefined();
    });

    it.each([['put', 'PUT'], ['patch', 'PATCH']])('%s sends a JSON body with the %s method', async (name, method) => {
      http.mockResolvedValue(mockResponse());
      await apiClient[name]('/api/admin/schedule', { a: 1 });

      const [, init] = http.mock.calls[0];
      expect(init.method).toBe(method);
      expect(init.body).toBe(JSON.stringify({ a: 1 }));
      expect(init.headers['Content-Type']).toBe('application/json');
    });

    it('exposes the HTTP status on the error of a failed response', async () => {
      http.mockResolvedValue(mockResponse({ ok: false, status: 401, text: JSON.stringify({ message: 'nope' }) }));

      await expect(apiClient.get('/api/admin/session')).rejects.toMatchObject({ message: 'nope', status: 401 });
    });

    it('merges custom headers without mutating the caller object', async () => {
      http.mockResolvedValue(mockResponse());
      const headers = { Authorization: 'Bearer x' };
      await apiClient.post('/p', { a: 1 }, { headers });

      const [, init] = http.mock.calls[0];
      expect(init.headers).toEqual({
        Authorization: 'Bearer x',
        'Content-Type': 'application/json',
      });
      expect(headers).toEqual({ Authorization: 'Bearer x' });
    });

    it('returns the parsed JSON of a successful response', async () => {
      http.mockResolvedValue(mockResponse({ json: { ok: 1 } }));
      await expect(apiClient.get('/x')).resolves.toEqual({ ok: 1 });
    });
  });

  describe('error message extraction', () => {
    it('uses errorData.message when it is a string', async () => {
      http.mockResolvedValue(
        mockResponse({ ok: false, status: 400, text: JSON.stringify({ message: 'Horario ocupado' }) }),
      );
      await expect(apiClient.get('/x')).rejects.toThrow(new Error('Horario ocupado'));
    });

    it('JSON-stringifies errorData.message when it is not a string', async () => {
      const message = ['name must be a string', 'email must be an email'];
      http.mockResolvedValue(
        mockResponse({ ok: false, status: 400, text: JSON.stringify({ message }) }),
      );
      await expect(apiClient.get('/x')).rejects.toThrow(new Error(JSON.stringify(message)));
    });

    it('falls back to errorData.error when there is no message', async () => {
      http.mockResolvedValue(
        mockResponse({ ok: false, status: 404, text: JSON.stringify({ error: 'Not Found' }) }),
      );
      await expect(apiClient.get('/x')).rejects.toThrow(new Error('Not Found'));
    });

    it('prefers message over error when both are present', async () => {
      http.mockResolvedValue(
        mockResponse({ ok: false, status: 400, text: JSON.stringify({ message: 'm', error: 'e' }) }),
      );
      await expect(apiClient.get('/x')).rejects.toThrow(new Error('m'));
    });

    it('uses the raw text when the body is not JSON', async () => {
      http.mockResolvedValue(mockResponse({ ok: false, status: 502, text: 'Bad gateway' }));
      await expect(apiClient.get('/x')).rejects.toThrow(new Error('Bad gateway'));
    });

    it('falls back to "HTTP error! status: <n>" for an empty body', async () => {
      http.mockResolvedValue(mockResponse({ ok: false, status: 500, text: '' }));
      await expect(apiClient.get('/x')).rejects.toThrow(new Error('HTTP error! status: 500'));
    });

    it('falls back to the status message for JSON without message/error', async () => {
      http.mockResolvedValue(mockResponse({ ok: false, status: 418, text: '{"foo":1}' }));
      await expect(apiClient.get('/x')).rejects.toThrow(new Error('HTTP error! status: 418'));
    });

    it('falls back to the status message when response.text() fails', async () => {
      const response = mockResponse({ ok: false, status: 503 });
      response.text.mockRejectedValue(new Error('no body'));
      http.mockResolvedValue(response);
      await expect(apiClient.get('/x')).rejects.toThrow(new Error('HTTP error! status: 503'));
    });

    it('rethrows network errors unchanged', async () => {
      const networkError = new TypeError('Failed to fetch');
      http.mockRejectedValue(networkError);
      await expect(apiClient.get('/x')).rejects.toBe(networkError);
    });
  });

  describe('timeout', () => {
    // The timer itself belongs to axios; the real adapter is exercised in http-client.test.js.
    it('applies the default 10000 ms timeout to every call', async () => {
      await apiClient.get('/slow');
      expect(http.mock.calls[0][1].timeout).toBe(10000);
    });

    it('honors a custom timeout option', async () => {
      await apiClient.post('/api/bookings', { a: 1 }, { timeout: 30000 });
      expect(http.mock.calls[0][1].timeout).toBe(30000);
    });

    it('does not leak a custom timeout into the next call', async () => {
      await apiClient.get('/a', { timeout: 30000 });
      await apiClient.get('/b');
      expect(http.mock.calls[1][1].timeout).toBe(10000);
    });
  });
});
