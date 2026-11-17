import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BRANDING_CACHE_KEY,
  DEFAULT_COLORS,
  applyBrandColors,
  buttonTextColor,
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
    const errors = validateBrandColors({ accent: '', background: '#0d0d0d', text: 'red', button: null });
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

  it('checks the button color only when present', () => {
    expect(validateBrandColors({ ...DEFAULT_COLORS, button: null })).toEqual({});
    const errors = validateBrandColors({ ...DEFAULT_COLORS, button: '#f0e0e0' });
    expect(errors.button).toBe('El color de los botones no contrasta lo suficiente con el fondo (mínimo 2:1).');
  });

  it('accepts a blue button on black: below 3:1 against the page, but its label is readable', () => {
    expect(validateBrandColors({ ...DEFAULT_COLORS, button: '#295294' })).toEqual({});
  });
});

describe('buttonTextColor', () => {
  it('picks white on a dark button and black on a light one', () => {
    expect(buttonTextColor({ ...DEFAULT_COLORS, button: '#295294' })).toBe('#ffffff');
    expect(buttonTextColor({ ...DEFAULT_COLORS, button: '#f62039' })).toBe('#000000');
    expect(buttonTextColor({ ...DEFAULT_COLORS, button: '#ffffff' })).toBe('#000000');
  });

  it('uses the accent when no button color is chosen', () => {
    expect(buttonTextColor({ ...DEFAULT_COLORS, accent: '#10205a', button: null })).toBe('#ffffff');
    expect(buttonTextColor({ ...DEFAULT_COLORS, accent: '#f62039', button: null })).toBe('#000000');
  });

  it('always reaches 4.5:1 with the label it picks', () => {
    for (const button of ['#808080', '#777777', '#999999', '#2e8b57', '#d2691e']) {
      const label = buttonTextColor({ ...DEFAULT_COLORS, button });
      expect(contrastRatio(label, button)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('applyBrandColors', () => {
  it('writes the label color of the buttons so it stays readable on the button color', () => {
    applyBrandColors({ ...DEFAULT_COLORS, button: '#295294' });
    expect(root().style.getPropertyValue('--brand-button-text')).toBe('#ffffff');
    applyBrandColors({ ...DEFAULT_COLORS, button: '#f62039' });
    expect(root().style.getPropertyValue('--brand-button-text')).toBe('#000000');
  });

  afterEach(() => root().removeAttribute('style'));

  it('writes the four brand variables on <html>', () => {
    applyBrandColors({ accent: '#336699', background: '#ffffff', text: '#111111', button: '#224466' });
    expect(root().style.getPropertyValue('--brand-accent')).toBe('#336699');
    expect(root().style.getPropertyValue('--brand-bg')).toBe('#ffffff');
    expect(root().style.getPropertyValue('--brand-text')).toBe('#111111');
    expect(root().style.getPropertyValue('--brand-button')).toBe('#224466');
  });

  it('hides the stylesheet default when the button color is null, so buttons follow the accent', () => {
    applyBrandColors({ ...DEFAULT_COLORS, button: '#224466' });
    applyBrandColors({ ...DEFAULT_COLORS, button: null });
    expect(root().style.getPropertyValue('--brand-button')).toBe('initial');
  });

  it('ignores invalid colors instead of writing them', () => {
    applyBrandColors({ accent: 'javascript:alert(1)', background: '#ffffff', text: '#111111', button: null });
    expect(root().style.getPropertyValue('--brand-accent')).toBe('');
    expect(root().style.getPropertyValue('--brand-bg')).toBe('#ffffff');
  });
});

describe('branding cache (localStorage branding:v2)', () => {
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
