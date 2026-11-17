import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../index.css');
const prelineTheme = read('../../node_modules/@preline/dropdown/theme.css');

// Every semantic Preline token the table / toast / loading / spinner markup relies on must resolve
// to a Tailwind color utility (theme.css `--color-*`) AND to a palette value (index.css `:root`).
const TOKENS = [
  'layer', 'layer-line', 'layer-foreground', 'primary', 'primary-hover', 'primary-focus',
  'primary-foreground', 'foreground', 'muted-foreground-1', 'table-line', 'scrollbar-track',
  'scrollbar-thumb', 'surface-4',
];

describe('Preline tokens used by the table / toast / loading / spinner markup', () => {
  it.each(TOKENS)('%s is exposed as a color utility and mapped to the app palette', (token) => {
    expect(prelineTheme).toContain(`--color-${token}: var(--${token});`);
    expect(css).toMatch(new RegExp(`^\\s*--${token}:`, 'm'));
  });

  it('defines the spinner-wave keyframes and a reduced-motion rule for the bars', () => {
    expect(css).toMatch(/@keyframes spinner-wave\s*{/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*spinner-wave-bar/);
  });
});

describe('Brand palette (SPEC 03)', () => {
  it('declares the four brand inputs with the Haas livery defaults', () => {
    expect(css).toMatch(/--brand-accent:\s*#f62039;/);
    expect(css).toMatch(/--brand-bg:\s*#111111;/);
    expect(css).toMatch(/--brand-text:\s*#ffffff;/);
    expect(css).toMatch(/--brand-button:\s*#295294;/);
  });

  it('gives buttons their own color, falling back to the accent when none is chosen', () => {
    expect(css).toMatch(/--button-text:\s*var\(--brand-button-text,\s*#ffffff\);/);
    expect(css).toMatch(/--primary-foreground:\s*var\(--button-text\);/);
    expect(css).toMatch(/--button:\s*var\(--brand-button,\s*var\(--brand-accent\)\);/);
    expect(css).toMatch(/--primary:\s*var\(--button\);/);
    expect(css).toMatch(/--primary-hover:\s*var\(--button-hover\);/);
  });

  it('derives every palette color from the brand inputs instead of hard-coded gold or black', () => {
    const withoutBrandInputs = css.replace(/^\s*--brand-[a-z-]+:.*$/gm, '');
    expect(withoutBrandInputs).not.toMatch(/#c9a96e|201,\s*169,\s*110|#0d0d0d|#141414|#1c1c1c|#f5f0e8|#242424|#2c2c2c/i);
    for (const token of ['bg-primary', 'bg-secondary', 'bg-tertiary', 'accent', 'accent-light', 'accent-dark', 'text-primary', 'text-secondary', 'text-muted']) {
      expect(css).toMatch(new RegExp(`--color-${token}:[^;]*var\\(--brand-`));
    }
  });
});
