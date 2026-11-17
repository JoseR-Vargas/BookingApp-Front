import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BRANDING_CACHE_KEY } from './brandTheme.js';

// The inline <script id="brand-cache"> in index.html runs before React; it is exercised here as-is.
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const source = html.match(/<script id="brand-cache">([\s\S]*?)<\/script>/)[1];
const runScript = () => new Function(source)();
const style = () => document.documentElement.style;

describe('index.html brand cache script', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('style');
  });

  it('applies the cached colors to the brand variables', () => {
    localStorage.setItem(
      BRANDING_CACHE_KEY,
      JSON.stringify({ colors: { accent: '#336699', background: '#FFFFFF', text: '#111111', button: null }, businessName: null }),
    );
    runScript();
    expect(style().getPropertyValue('--brand-accent')).toBe('#336699');
    expect(style().getPropertyValue('--brand-bg')).toBe('#ffffff');
    expect(style().getPropertyValue('--brand-text')).toBe('#111111');
    expect(style().getPropertyValue('--brand-button')).toBe('initial');
  });

  it('applies a cached button color', () => {
    localStorage.setItem(
      BRANDING_CACHE_KEY,
      JSON.stringify({ colors: { accent: '#f62039', background: '#111111', text: '#ffffff', button: '#295294' }, businessName: null }),
    );
    runScript();
    expect(style().getPropertyValue('--brand-button')).toBe('#295294');
  });

  it('picks a readable label color for the buttons', () => {
    const cache = (colors) => localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify({ colors, businessName: null }));
    cache({ accent: '#f62039', background: '#111111', text: '#ffffff', button: '#295294' });
    runScript();
    expect(style().getPropertyValue('--brand-button-text')).toBe('#ffffff');

    document.documentElement.removeAttribute('style');
    cache({ accent: '#f62039', background: '#111111', text: '#ffffff', button: '#f62039' });
    runScript();
    expect(style().getPropertyValue('--brand-button-text')).toBe('#000000');

    document.documentElement.removeAttribute('style');
    cache({ accent: '#10205a', background: '#ffffff', text: '#111111', button: null });
    runScript();
    expect(style().getPropertyValue('--brand-button-text')).toBe('#ffffff');
  });

  it.each([
    ['no cache', null],
    ['corrupt JSON', '{oops'],
    ['invalid colors', JSON.stringify({ colors: { accent: 'url(x)', background: 'red' } })],
  ])('does nothing and does not throw with %s', (_label, value) => {
    if (value !== null) localStorage.setItem(BRANDING_CACHE_KEY, value);
    expect(runScript).not.toThrow();
    expect(document.documentElement.getAttribute('style')).toBeNull();
  });
});
