// ===== CLIENTE HTTP CENTRALIZADO =====
// Thin facade over the axios instance in ./http: services keep calling apiClient.get/post/... and
// never see axios. Global concerns (auth headers, timeout, logging) hook onto that instance.
// Ported from the legacy js/core/api-client.js; behavior must stay identical.

import { http, DEFAULT_TIMEOUT } from './http/http-client.js';
import { toHttpError } from './http/to-http-error.js';

export const apiClient = {
  async request(method, path, body, options) {
    const opts = options || {};
    const config = {
      method,
      url: path,
      headers: Object.assign({}, opts.headers || {}),
      timeout: opts.timeout || DEFAULT_TIMEOUT,
    };
    if (body !== null && body !== undefined) {
      config.headers['Content-Type'] = 'application/json';
      config.data = JSON.stringify(body);
    }

    let response;
    try {
      response = await http.request(config);
    } catch (error) {
      throw toHttpError(error);
    }
    // The body travels as raw text; parsing here matches fetch's response.json() (throws on bad JSON).
    return JSON.parse(response.data);
  },

  get(path, options) {
    return apiClient.request('GET', path, null, options);
  },

  post(path, body, options) {
    return apiClient.request('POST', path, body, options);
  },

  put(path, body, options) {
    return apiClient.request('PUT', path, body, options);
  },

  patch(path, body, options) {
    return apiClient.request('PATCH', path, body, options);
  },

  delete(path, options) {
    return apiClient.request('DELETE', path, null, options);
  },
};
