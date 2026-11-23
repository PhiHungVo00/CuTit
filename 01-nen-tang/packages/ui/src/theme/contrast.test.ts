import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../theme.css', import.meta.url), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`thiếu khối ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const d of body.matchAll(/--ct-([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[d[1]!] = d[2]!;
  return out;
}

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

describe('tương phản chữ (WCAG AA ≥ 4.5)', () => {
  for (const theme of ['light', 'dark']) {
    const t = block(`[data-theme='${theme}']`);
    const pairs: Array<[string, string]> = [
      ['ink', 'canvas'],
      ['ink', 'surface'],
      ['accent-ink', 'accent'],
      ['heading', 'canvas'],
      ['ink-soft', 'surface'],
    ];
    for (const [fg, bg] of pairs) {
      it(`${theme}: ${fg}/${bg}`, () => {
        expect(t[fg], `thiếu --ct-${fg}`).toBeDefined();
        expect(t[bg], `thiếu --ct-${bg}`).toBeDefined();
        expect(ratio(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
  it('bảng sáng đúng đặc tả', () => {
    const t = block(`[data-theme='light']`);
    expect(t.canvas!.toLowerCase()).toBe('#fbf3e4');
    expect(t.surface!.toLowerCase()).toBe('#fffdf8');
    expect(t.heading!.toLowerCase()).toBe('#5a3e28');
    expect(t.ink!.toLowerCase()).toBe('#3b2a1e');
    expect(t.accent!.toLowerCase()).toBe('#6fa544');
    expect(t.line!.toLowerCase()).toBe('#eadfcb');
  });
});
