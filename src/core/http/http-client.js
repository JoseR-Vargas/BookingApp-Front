// ===== AXIOS INSTANCE =====
// The single axios instance of the front: base URL and the default timeout live here. Nothing outside
// src/core imports axios; services go through apiClient. Interceptors (tenant header, 401 handling)
// hook onto this instance when the specs that need them arrive.

import axios from 'axios';
import { APP_CONFIG } from '../../config/appConfig.js';

export const BACKEND_URL = APP_CONFIG?.BACKEND_URL || 'http://localhost:3000';
export const DEFAULT_TIMEOUT = 10000;

export const http = axios.create({
  baseURL: BACKEND_URL,
  timeout: DEFAULT_TIMEOUT,
  // Keep the body as raw text: toHttpError and apiClient parse it exactly like the legacy fetch client.
  responseType: 'text',
});

// axios adds `Accept: application/json, text/plain, */*` to every call; fetch sent none of its own.
http.defaults.headers.common = {};
