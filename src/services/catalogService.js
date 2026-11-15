// ===== SERVICIO DE CATÁLOGO =====
// Public catalog (active professionals and services + weekly schedule). Backend is the source of truth.

import { apiClient } from '../core/apiClient.js';

export function getCatalog() {
  return apiClient.get('/api/catalog');
}
