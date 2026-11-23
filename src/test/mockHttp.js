// ===== FAKE NETWORK FOR TESTS =====
// Installs a fake adapter on the app's axios instance (src/core/http), so tests exercise the REAL
// apiClient + services without a global `fetch` stub and without caring whether axios uses XHR or
// fetch underneath.
//
// installMockHttp(impl) returns a vi.fn that records every call as `(url, init)` where
//   url  = absolute URL (baseURL + path),
//   init = { method, headers (plain object), body (raw string | undefined), timeout }.
// `impl` (a plain function, or an existing vi.fn) answers with a response double ({ ok, status, json(), text() }) or throws/rejects to
// simulate a network failure. A non-2xx double becomes an axios error exactly like a real adapter.

import { vi } from 'vitest';
import { AxiosError } from 'axios';
import { http } from '../core/http/http-client.js';

const realAdapter = http.defaults.adapter;

async function bodyOf(response) {
  if (response.ok) {
    return JSON.stringify(await response.json());
  }
  try {
    return (await response.text()) || '';
  } catch (textError) {
    return '';
  }
}

export function installMockHttp(impl) {
  const handler = vi.isMockFunction(impl) ? impl : vi.fn(impl);

  http.defaults.adapter = async (config) => {
    const init = {
      method: String(config.method).toUpperCase(),
      headers: config.headers.toJSON(),
      body: config.data === undefined ? undefined : config.data,
      timeout: config.timeout,
    };
    const response = await handler(http.getUri(config), init);
    const result = {
      status: response.status ?? 200,
      statusText: '',
      headers: {},
      config,
      data: await bodyOf(response),
    };
    if (response.ok) return result;
    throw new AxiosError(
      `Request failed with status code ${result.status}`,
      AxiosError.ERR_BAD_RESPONSE,
      config,
      null,
      result,
    );
  };

  return handler;
}

export function restoreHttp() {
  http.defaults.adapter = realAdapter;
}
