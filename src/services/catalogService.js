// ===== SERVICIO DE CATÁLOGO =====
// Public catalog (active professionals and services + weekly schedule). Backend is the source of truth.

import { apiClient } from '../core/apiClient.js';
import { catalogSchema } from '../schemas/api/catalog.schema.js';
import { parseResponse } from '../schemas/parse-response.js';

export async function getCatalog() {
  return parseResponse(catalogSchema, await apiClient.get('/api/catalog'));
}
