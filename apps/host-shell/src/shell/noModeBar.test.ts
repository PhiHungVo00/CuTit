import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

// Dự án 2 Task 8: thanh đổi chế độ Cu Tít (Chat · Nhập vai · Gọi thoại · Camera) bị gỡ — lối vào chính là màn chat.
describe('gỡ CuTitModeBar', () => {
  it('không còn tệp CuTitModeBar', () => {
    expect(existsSync(new URL('./CuTitModeBar.tsx', import.meta.url))).toBe(false);
  });
  it.each(['ChatRoute', 'CallRoute', 'RoleplayRoute', 'CameraRoute'])('%s không dùng thanh chế độ', (name) => {
    const src = read(`../screens/${name}.tsx`);
    expect(src).not.toContain('CuTitModeBar');
    expect(src).not.toContain('mode-tabs');
  });
  it('CSS không còn kiểu của thanh chế độ', () => {
    const css = read('../styles/global.css');
    expect(css).not.toContain('.mode-tabs');
    expect(css).not.toContain('.mode-bar');
  });
  it('màn cũ /nhap-vai và /camera (link cũ) vẫn có nút quay lại, tránh ngõ cụt', () => {
    expect(read('../screens/RoleplayRoute.tsx')).toContain('BackBar');
    expect(read('../screens/CameraRoute.tsx')).toContain('BackBar');
  });
});
