import { describe, expect, it } from 'vitest';
import { safeHttpsUrl } from './safeUrl';

describe('safeHttpsUrl', () => {
  it('nhận https hợp lệ', () => {
    expect(safeHttpsUrl('https://becutit.example/tai')).toBe('https://becutit.example/tai');
  });
  it.each(['http://becutit.example/tai', 'javascript:alert(1)', 'intent://x#Intent;scheme=https;end', 'data:text/html,hi', 'file:///etc/passwd', 'ftp://a.b/c'])('từ chối lược đồ khác: %s', (u) => {
    expect(safeHttpsUrl(u)).toBeNull();
  });
  it('từ chối URL hỏng, rỗng, không phải chuỗi', () => {
    expect(safeHttpsUrl('not a url')).toBeNull();
    expect(safeHttpsUrl('')).toBeNull();
    expect(safeHttpsUrl('https://')).toBeNull();
    expect(safeHttpsUrl(null)).toBeNull();
    expect(safeHttpsUrl(42)).toBeNull();
  });
  it('từ chối URL có tài khoản kèm theo (https://tin-cay@host-la)', () => {
    expect(safeHttpsUrl('https://becutit.example@evil.example/x')).toBeNull();
  });
});
