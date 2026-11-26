// ===== ENLACES POR NEGOCIO =====
// Builds an in-app path for a business: the default one keeps the plain path.

/** `tenantPath('sur', '/admin')` -> `/n/sur/admin`; `tenantPath(null, '/admin')` -> `/admin`. */
export function tenantPath(slug, path = '/') {
  if (!slug) return path;
  return path === '/' ? `/n/${slug}` : `/n/${slug}${path}`;
}
