// ===== BRAND THEME =====
// The whole palette (src/index.css) derives from four CSS variables on <html>: --brand-accent,
// --brand-bg, --brand-text and the optional --brand-accent-secondary. This module writes them,
// validates a palette with the same WCAG contrast rules as the backend (SPEC 03), and keeps the
// last known branding in localStorage so a reload paints the right colors before React runs
// (see the inline script in index.html, which reads the same key).

export const BRANDING_CACHE_KEY = 'branding:v1';

export const DEFAULT_COLORS = Object.freeze({
  accent: '#f62039',
  background: '#f9f2f2',
  text: '#111111',
  accentSecondary: '#295294',
});

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const CSS_VARIABLES = {
  accent: '--brand-accent',
  background: '--brand-bg',
  text: '--brand-text',
  accentSecondary: '--brand-accent-secondary',
};

export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_ACCENT_CONTRAST = 3;

const MESSAGES = {
  format: 'Usa un color en formato #rrggbb.',
  text: 'El texto no contrasta lo suficiente con el fondo (mínimo 4.5:1).',
  accent: 'El acento no contrasta lo suficiente con el fondo (mínimo 3:1).',
  accentSecondary: 'El acento secundario no contrasta lo suficiente con el fondo (mínimo 3:1).',
};

export const isHexColor = (value) => typeof value === 'string' && HEX_COLOR.test(value);

// WCAG 2.1 relative luminance of an sRGB '#rrggbb' color.
function relativeLuminance(hex) {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two '#rrggbb' colors (1 to 21). */
export function contrastRatio(first, second) {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Field-keyed error messages for a palette; an empty object means it can be saved.
 * Mirrors the backend rules: format first, then contrast against the background.
 */
export function validateBrandColors(colors) {
  const errors = {};
  for (const field of ['accent', 'background', 'text']) {
    if (!isHexColor(colors?.[field])) errors[field] = MESSAGES.format;
  }
  const secondary = colors?.accentSecondary;
  if (secondary !== null && secondary !== undefined && !isHexColor(secondary)) {
    errors.accentSecondary = MESSAGES.format;
  }
  if (errors.background) return errors;

  const { background } = colors;
  if (!errors.text && contrastRatio(colors.text, background) < MIN_TEXT_CONTRAST) errors.text = MESSAGES.text;
  if (!errors.accent && contrastRatio(colors.accent, background) < MIN_ACCENT_CONTRAST) errors.accent = MESSAGES.accent;
  if (isHexColor(secondary) && !errors.accentSecondary && contrastRatio(secondary, background) < MIN_ACCENT_CONTRAST) {
    errors.accentSecondary = MESSAGES.accentSecondary;
  }
  return errors;
}

/** Writes the brand variables on <html>. Invalid values are skipped; a null secondary is removed. */
export function applyBrandColors(colors, element = document.documentElement) {
  for (const [field, variable] of Object.entries(CSS_VARIABLES)) {
    const value = colors?.[field];
    if (isHexColor(value)) element.style.setProperty(variable, value.toLowerCase());
    else if (field === 'accentSecondary' && (value === null || value === undefined)) element.style.removeProperty(variable);
  }
}

const isValidCache = (entry) =>
  entry !== null &&
  typeof entry === 'object' &&
  ['accent', 'background', 'text'].every((field) => isHexColor(entry.colors?.[field])) &&
  (entry.colors.accentSecondary === null || isHexColor(entry.colors.accentSecondary)) &&
  (entry.businessName === null || typeof entry.businessName === 'string');

/** Last branding seen by this browser, or null when absent or not trustworthy. */
export function readBrandingCache() {
  try {
    const entry = JSON.parse(localStorage.getItem(BRANDING_CACHE_KEY));
    return isValidCache(entry) ? { colors: entry.colors, businessName: entry.businessName } : null;
  } catch {
    return null;
  }
}

export function writeBrandingCache({ colors, businessName }) {
  try {
    localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify({ colors, businessName: businessName ?? null }));
  } catch {
    // Storage full or disabled (private mode): the cache is only a paint optimization.
  }
}
