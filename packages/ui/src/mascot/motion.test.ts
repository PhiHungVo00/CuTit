import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./cutit.css', import.meta.url), 'utf8');

describe('hoạt ảnh phản hồi (P1-2)', () => {
  it('khai báo lớp trượt vào / lắc / nảy', () => {
    expect(css).toMatch(/\.ct-feedback\s*\{[^}]*animation:[^}]*ct-slide-up/);
    expect(css).toMatch(/\.ct-shake\s*\{[^}]*animation:[^}]*ct-shake/);
    expect(css).toMatch(/\.ct-pop\s*\{[^}]*animation:[^}]*ct-pop/);
  });
  it('bảng phản hồi trượt 160ms', () => {
    expect(css).toMatch(/\.ct-feedback\s*\{[^}]*160ms/);
  });
  it('tắt cả ba khi giảm chuyển động (hệ điều hành và công tắc của app)', () => {
    expect(css).toMatch(/prefers-reduced-motion[^{]*\{\s*\.ct-feedback, \.ct-shake, \.ct-pop \{\s*animation:\s*none/);
    expect(css).toMatch(/data-reduced-motion='true'\] :is\(\.ct-feedback, \.ct-shake, \.ct-pop\) \{\s*animation:\s*none/);
  });
  it('Cu Tít khen trong bảng phản hồi chỉ nảy một lần', () => {
    expect(css).toMatch(/\.ct-feedback \.ct-cutit--nhun\s*\{[^}]*iteration-count:\s*1/);
  });
});
