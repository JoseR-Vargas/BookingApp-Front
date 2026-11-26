// ===== RESOLUCIÓN DEL NEGOCIO =====
// The business of a page comes from its route: `/n/<slug>/...`. Any other route belongs to the
// default business (no slug), so the links shared before the multi-business work keep working.

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const TENANT_ROUTE = /^\/n\/([^/]+)(?:\/|$)/;

/** The slug of a path (`/n/<slug>/...`), or null for the default business or an invalid slug. */
export function parseTenantPath(pathname) {
  const match = TENANT_ROUTE.exec(pathname || '');
  if (!match) return null;
  const slug = match[1].toLowerCase();
  return SLUG_PATTERN.test(slug) ? slug : null;
}

/** The business of the address bar, read when a request is sent or a session key is built. */
export function currentTenantSlug() {
  return parseTenantPath(window.location.pathname);
}
