// ===== SLUG SUGERIDO =====
// The suggested address of a business, derived from its name: lowercase letters, digits and dashes.
// The backend has the last word (reserved and repeated slugs are rejected there).

/** `"Barbería Don Pepe!"` -> `"barberia-don-pepe"`. */
export function slugify(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}
