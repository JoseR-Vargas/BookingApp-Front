import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BRANDING_CACHE_KEY,
  DEFAULT_COLORS,
  applyBrandColors,
  contrastRatio,
  readBrandingCache,
  validateBrandColors,
  writeBrandingCache,
} from './brandTheme.js';

const root = () => document.documentElement;

describe('contrastRatio (WCAG 2.1)', () => {
  it('is 21 for black on white and 1 for equal colors', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('matches the known value for #777777 on #ffffff (about 4.48)', () => {
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});

describe('validateBrandColors', () => {
  it('accepts the default palette', () => {
    expect(validateBrandColors(DEFAULT_COLORS)).toEqual({});
  });

  it('requires accent, background and text in #rrggbb form', () => {
    const errors = validateBrandColors({ accent: '', background: '#0d0d0d', text: 'red', accentSecondary: null });
    expect(errors.accent).toBe('Usa un color en formato #rrggbb.');
    expect(errors.text).toBe('Usa un color en formato #rrggbb.');
    expect(errors.background).toBeUndefined();
  });

  it('blocks text that does not contrast with the background (4.5:1)', () => {
    const errors = validateBrandColors({ ...DEFAULT_COLORS, text: '#777777', background: '#888888', accent: '#000000' });
    expect(errors.text).toBe('El texto no contrasta lo suficiente con el fondo (mínimo 4.5:1).');
  });

  it('blocks an accent below 3:1 against the background', () => {
    const errors = validateBrandColors({ ...DEFAULT_COLORS, accent: '#f0e0e0' });
    expect(errors.accent).toBe('El acento no contrasta lo suficiente con el fondo (mínimo 3:1).');
  });

  it('checks the secondary accent only when present', () => {
    expect(validateBrandColors({ ...DEFAULT_COLORS, accentSecondary: null })).toEqual({});
    const errors = validateBrandColors({ ...DEFAULT_COLORS, accentSecondary: '#f0e0e0' });
    expect(errors.accentSecondary).toBe('El acento secundario no contrasta lo suficiente con el fondo (mínimo 3:1).');
  });
});

describe('applyBrandColors', () => {
  afterEach(() => root().removeAttribute('style'));

  it('writes the four brand variables on <html>', () => {
    applyBrandColors({ accent: '#336699', background: '#ffffff', text: '#111111', accentSecondary: '#224466' });
    expect(root().style.getPropertyValue('--brand-accent')).toBe('#336699');
    expect(root().style.getPropertyValue('--brand-bg')).toBe('#ffffff');
    expect(root().style.getPropertyValue('--brand-text')).toBe('#111111');
    expect(root().style.getPropertyValue('--brand-accent-secondary')).toBe('#224466');
  });

  it('removes the secondary accent when it is null, so CSS derives it', () => {
    applyBrandColors({ ...DEFAULT_COLORS, accentSecondary: '#224466' });
    applyBrandColors({ ...DEFAULT_COLORS, accentSecondary: null });
    expect(root().style.getPropertyValue('--brand-accent-secondary')).toBe('');
  });

  it('ignores invalid colors instead of writing them', () => {
    applyBrandColors({ accent: 'javascript:alert(1)', background: '#ffffff', text: '#111111', accentSecondary: null });
    expect(root().style.getPropertyValue('--brand-accent')).toBe('');
    expect(root().style.getPropertyValue('--brand-bg')).toBe('#ffffff');
  });
});

describe('branding cache (localStorage branding:v1)', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips colors and business name', () => {
    writeBrandingCache({ colors: DEFAULT_COLORS, businessName: 'Barbería Don Pepe' });
    expect(JSON.parse(localStorage.getItem(BRANDING_CACHE_KEY))).toEqual({
      colors: DEFAULT_COLORS,
      businessName: 'Barbería Don Pepe',
    });
    expect(readBrandingCache()).toEqual({ colors: DEFAULT_COLORS, businessName: 'Barbería Don Pepe' });
  });

  it('returns null for missing, malformed or invalid entries', () => {
    expect(readBrandingCache()).toBeNull();
    localStorage.setItem(BRANDING_CACHE_KEY, '{not json');
    expect(readBrandingCache()).toBeNull();
    localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify({ colors: { accent: 'red' }, businessName: null }));
    expect(readBrandingCache()).toBeNull();
  });
});
