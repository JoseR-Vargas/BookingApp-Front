// ===== ALTA DE NEGOCIOS =====
// POST /api/signup creates the business, its first owner and the cookie session in one operation.

import { apiClient } from '../core/apiClient.js';
import { authService } from './authService.js';

export async function signUpBusiness({ businessName, adminName, email, password, slug }) {
  const body = { businessName, adminName, email, password };
  if (slug) body.slug = slug;
  const created = await apiClient.post('/api/signup', body);
  const tenant = created && created.tenant;
  if (!tenant || !tenant.slug || !created.user) {
    throw new Error('No pudimos crear tu negocio. Intenta nuevamente.');
  }
  authService.startAccountSession(tenant.slug, created.user);
  return { slug: tenant.slug, name: tenant.name, user: created.user };
}
