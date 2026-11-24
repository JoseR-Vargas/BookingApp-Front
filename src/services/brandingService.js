// ===== SERVICIO DE MARCA =====
// Public branding (business name, brand colors, logo URL). Backend is the source of truth (SPEC 03).

import { apiClient } from '../core/apiClient.js';
import { brandingSchema } from '../schemas/api/branding.schema.js';
import { parseResponse } from '../schemas/parse-response.js';
import { backendAssetUrl } from '../utils/assetUrl.js';

export async function getBranding() {
  return parseResponse(brandingSchema, await apiClient.get('/api/branding'));
}

/** The backend returns the logo URL relative to itself ('/api/branding/logo?v=...'). */
export function brandLogoSrc(logoUrl) {
  return backendAssetUrl(logoUrl);
}
