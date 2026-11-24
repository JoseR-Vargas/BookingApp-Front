// The ONE test file that stubs the global `fetch` on purpose: it checks the real axios adapter
// (timers, abort, network failure) through apiClient, which the fake adapter of mockHttp cannot.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, DEFAULT_TIMEOUT, BACKEND_URL } from './http-client.js';
import { apiClient } from '../apiClient.js';

const TIMEOUT_MESSAGE =
  'Timeout: La solicitud tardó demasiado tiempo. Por favor verifica tu conexión e intenta nuevamente.';

// axios' fetch adapter calls fetch(Request): never resolves, rejects with AbortError when aborted.
function hangingFetch() {
  return vi.fn((request) => new Promise((resolve, reject) => {
    request.signal.addEventListener('abort', () => {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    });
  }));
}

describe('http client (real axios adapter)', () => {
  const originalAdapter = http.defaults.adapter;

  beforeEach(() => {
    http.defaults.adapter = 'fetch';
  });

  afterEach(() => {
    http.defaults.adapter = originalAdapter;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is configured with the backend base URL and a 10000 ms timeout', () => {
    expect(DEFAULT_TIMEOUT).toBe(10000);
    expect(http.defaults.timeout).toBe(10000);
    expect(http.defaults.baseURL).toBe(BACKEND_URL);
  });

  it('adds no default Accept header and no Content-Type to a GET', async () => {
    const fetchStub = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchStub);
    await apiClient.get('/api/x');
    const request = fetchStub.mock.calls[0][0];
    expect(request.url).toBe(`${BACKEND_URL}/api/x`);
    expect(request.headers.get('content-type')).toBeNull();
  });

  it('times out after the default 10000 ms with the Spanish message', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hangingFetch());
    const assertion = expect(apiClient.get('/slow')).rejects.toThrow(new Error(TIMEOUT_MESSAGE));

    await vi.advanceTimersByTimeAsync(9999);
    expect(fetch.mock.calls[0][0].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch.mock.calls[0][0].signal.aborted).toBe(true);
    await assertion;
  });

  it('times out after a custom timeout option', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hangingFetch());
    const assertion = expect(apiClient.post('/api/bookings', { a: 1 }, { timeout: 30000 }))
      .rejects.toThrow(new Error(TIMEOUT_MESSAGE));

    await vi.advanceTimersByTimeAsync(29999);
    expect(fetch.mock.calls[0][0].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch.mock.calls[0][0].signal.aborted).toBe(true);
    await assertion;
  });

  it('does not abort once the response arrived (no late timeout)', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":1}', { status: 200 })));
    await expect(apiClient.get('/fast')).resolves.toEqual({ ok: 1 });
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetch.mock.calls[0][0].signal.aborted).toBe(false);
  });

  it('surfaces a network failure as a "Failed to fetch" error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(apiClient.get('/x')).rejects.toThrow('Failed to fetch');
  });

  it('keeps the HTTP status and message of a failed response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'nope' }), { status: 401 })));
    await expect(apiClient.get('/x')).rejects.toMatchObject({ message: 'nope', status: 401 });
  });
});
