import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./global.css', import.meta.url), 'utf8');

describe('khoảng đệm đáy cho bong bóng Cu Tít (P0-2)', () => {
  it('.shell-main (có thanh tab + bong bóng) cộng thêm chỗ cho bong bóng 60px + lề 12px', () => {
    const rule = /\.shell-main\s*\{[^}]*\}/.exec(css)![0];
    expect(rule).toMatch(/padding-bottom:\s*calc\(var\(--tabbar-h\)\s*\+\s*var\(--safe-bottom\)\s*\+\s*var\(--bubble-space\)\)/);
    expect(css).toMatch(/--bubble-space:\s*72px/);
  });
  it('.shell-main.focus không đệm thêm (không có bong bóng)', () => {
    const rule = /\.shell-main\.focus\s*\{[^}]*\}/.exec(css)![0];
    expect(rule).not.toMatch(/bubble-space/);
  });
});
