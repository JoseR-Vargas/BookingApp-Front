// ===== AXIOS ERROR -> APP ERROR =====
// Turns what axios throws into the same Error the legacy fetch-based apiClient built, because the
// UI shows these messages and the tests pin them. Pure function: no I/O.

import { isAxiosError } from 'axios';

const TIMEOUT_MESSAGE =
  'Timeout: La solicitud tardó demasiado tiempo. Por favor verifica tu conexión e intenta nuevamente.';

// The XHR adapter reports a timeout as ECONNABORTED ("timeout of Nms exceeded"), but uses the same
// code for a user abort ("Request aborted"); the fetch adapter reports ETIMEDOUT.
function isTimeout(error) {
  if (error.code === 'ETIMEDOUT') return true;
  return error.code === 'ECONNABORTED' && String(error.message).startsWith('timeout');
}

// `body` is the raw response text (the client never lets axios parse it).
function messageFromBody(status, body) {
  let message = 'HTTP error! status: ' + status;
  if (typeof body !== 'string' || body === '') return message;
  try {
    const data = JSON.parse(body);
    if (data.message) {
      message = typeof data.message === 'string' ? data.message : JSON.stringify(data.message);
    } else if (data.error) {
      message = data.error;
    }
  } catch (parseError) {
    message = body;
  }
  return message;
}

export function toHttpError(error) {
  if (!isAxiosError(error)) return error;

  if (error.response) {
    const { status, data } = error.response;
    const httpError = new Error(messageFromBody(status, data));
    // The status travels with the error so callers can tell e.g. a 401 from a network failure.
    // Non-enumerable so the error still compares equal to a plain `new Error(message)`.
    Object.defineProperty(httpError, 'status', { value: status });
    return httpError;
  }

  if (isTimeout(error)) return new Error(TIMEOUT_MESSAGE);

  if (error.code === 'ERR_NETWORK') {
    // Same shape a failed fetch() throws; useAvailableTimes recognises it to retry.
    return new TypeError('Failed to fetch', { cause: error });
  }

  return error;
}
