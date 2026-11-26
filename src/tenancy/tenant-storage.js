// ===== SESIÓN DE ADMIN POR NEGOCIO =====
// The admin session lives in sessionStorage. The default business keeps the legacy keys; every
// other business gets its own (`adminKey:<slug>`), so one browser can manage two businesses.

export function sessionKey(name, slug) {
  return slug ? `${name}:${slug}` : name;
}
