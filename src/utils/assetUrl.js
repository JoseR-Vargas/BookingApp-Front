import { APP_CONFIG } from '../config/appConfig.js';

const BACKEND_URL = APP_CONFIG?.BACKEND_URL || 'http://localhost:3000';

/**
 * Full URL of a file the backend serves (logo, professional photos). The backend returns those
 * paths relative to itself ('/api/branding/logo?v=...'); an empty path means "no file".
 * `data:` and `blob:` URLs (a picked image previewed before upload) are already complete.
 */
export function backendAssetUrl(path) {
  if (!path) return null;
  return /^(data|blob):/.test(path) ? path : BACKEND_URL + path;
}
