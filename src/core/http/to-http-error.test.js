import { describe, it, expect } from 'vitest';
import { AxiosError } from 'axios';
import { toHttpError } from './to-http-error.js';

const TIMEOUT_MESSAGE =
  'Timeout: La solicitud tardó demasiado tiempo. Por favor verifica tu conexión e intenta nuevamente.';

// An axios error as the adapters build it for a non-2xx response; `data` is the raw body text.
function httpFailure(status, data) {
  return new AxiosError(`Request failed with status code ${status}`, AxiosError.ERR_BAD_RESPONSE, {}, null, {
    status,
    data,
    headers: {},
    config: {},
  });
}

describe('toHttpError', () => {
  it.each([
    ['a string message', 400, JSON.stringify({ message: 'Horario ocupado' }), 'Horario ocupado'],
    [
      'a non-string message (JSON-stringified)',
      400,
      JSON.stringify({ message: ['name must be a string', 'email must be an email'] }),
      JSON.stringify(['name must be a string', 'email must be an email']),
    ],
    ['only an error field', 404, JSON.stringify({ error: 'Not Found' }), 'Not Found'],
    ['both message and error (message wins)', 400, JSON.stringify({ message: 'm', error: 'e' }), 'm'],
    ['a body that is not JSON (raw text)', 502, 'Bad gateway', 'Bad gateway'],
    ['an empty body', 500, '', 'HTTP error! status: 500'],
    ['JSON without message or error', 418, '{"foo":1}', 'HTTP error! status: 418'],
    ['a JSON null body (raw text)', 500, 'null', 'null'],
  ])('builds the message for %s', (_label, status, data, expected) => {
    const error = toHttpError(httpFailure(status, data));
    expect(error).toEqual(new Error(expected));
    expect(error.message).toBe(expected);
  });

  it('uses the default message when the body is missing', () => {
    expect(toHttpError(httpFailure(503, undefined)).message).toBe('HTTP error! status: 503');
  });

  it('carries the status as a non-enumerable property', () => {
    const error = toHttpError(httpFailure(401, JSON.stringify({ message: 'nope' })));
    expect(error).toMatchObject({ message: 'nope', status: 401 });
    expect(Object.keys(error)).not.toContain('status');
    expect(Object.getOwnPropertyDescriptor(error, 'status').enumerable).toBe(false);
    expect(error).toEqual(new Error('nope'));
  });

  it('maps the XHR timeout (ECONNABORTED) to the Spanish timeout message', () => {
    const axiosTimeout = new AxiosError('timeout of 10000ms exceeded', AxiosError.ECONNABORTED);
    expect(toHttpError(axiosTimeout)).toEqual(new Error(TIMEOUT_MESSAGE));
    expect(toHttpError(axiosTimeout).message).toBe(TIMEOUT_MESSAGE);
  });

  it('maps the fetch-adapter timeout (ETIMEDOUT) to the Spanish timeout message', () => {
    const axiosTimeout = new AxiosError('timeout of 10000ms exceeded', AxiosError.ETIMEDOUT);
    expect(toHttpError(axiosTimeout).message).toBe(TIMEOUT_MESSAGE);
  });

  it('does not treat an aborted XHR as a timeout', () => {
    const aborted = new AxiosError('Request aborted', AxiosError.ECONNABORTED);
    expect(toHttpError(aborted)).toBe(aborted);
  });

  it('maps a network failure to a "Failed to fetch" error that keeps the original as cause', () => {
    const network = new AxiosError('Network Error', AxiosError.ERR_NETWORK);
    const error = toHttpError(network);
    expect(error).toBeInstanceOf(TypeError);
    expect(error.message).toBe('Failed to fetch');
    expect(error.cause).toBe(network);
  });

  it('returns errors that are not axios errors unchanged', () => {
    const boom = new TypeError('Failed to fetch');
    expect(toHttpError(boom)).toBe(boom);
  });
});

describe('toHttpError: too many requests (spec 22)', () => {
  const failure = (status, data) => Object.assign(new AxiosError('x'), { response: { status, data } });

  it('uses the backend message when there is one', () => {
    expect(toHttpError(failure(429, JSON.stringify({ message: 'Demasiadas peticiones. Intenta más tarde.' }))).message)
      .toBe('Demasiadas peticiones. Intenta más tarde.');
  });

  it('has its own message when the body says nothing', () => {
    expect(toHttpError(failure(429, '')).message).toBe('Demasiadas peticiones. Intenta más tarde.');
  });
});
