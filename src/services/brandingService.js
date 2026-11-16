// ===== SERVICIO DE MARCA =====
// Public branding (business name, brand colors, logo URL). Backend is the source of truth (SPEC 03).

import { APP_CONFIG } from '../config/appConfig.js';
import { apiClient } from '../core/apiClient.js';

const BACKEND_URL = APP_CONFIG?.BACKEND_URL || 'http://localhost:3000';

export function getBranding() {
  return apiClient.get('/api/branding');
}

/** The backend returns the logo URL relative to itself ('/api/branding/logo?v=...'). */
export function brandLogoSrc(logoUrl) {
  return logoUrl ? BACKEND_URL + logoUrl : null;
}
