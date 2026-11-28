import { APP_CONFIG } from '../config/appConfig.js';
import { currentTenantSlug } from '../tenancy/tenant-resolver.js';

const BACKEND_URL = APP_CONFIG?.BACKEND_URL || 'http://localhost:3000';

/**
 * Full URL of a file the backend serves (logo, professional photos). The backend returns those
 * paths relative to itself ('/api/branding/logo?v=...'); an empty path means "no file".
 * `data:` and `blob:` URLs (a picked image previewed before upload) are already complete.
 *
 * An `<img>` tag cannot send the `X-Tenant` header, so a business other than the default one
 * names itself in the URL (`&tenant=sur`): without it the file would be asked to the default
 * business, which does not have it.
 */
export function backendAssetUrl(path) {
  if (!path) return null;
  if (/^(data|blob):/.test(path)) return path;
  const slug = currentTenantSlug();
  const url = BACKEND_URL + path;
  if (!slug) return url;
  return `${url}${url.includes('?') ? '&' : '?'}tenant=${encodeURIComponent(slug)}`;
}
