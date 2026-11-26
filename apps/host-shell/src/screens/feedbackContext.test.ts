import { describe, expect, it } from 'vitest';
import { errorReport, osLabel } from './feedbackContext';

describe('osLabel', () => {
  it('Android WebView => "Android 15"', () => {
    expect(osLabel('Mozilla/5.0 (Linux; Android 15; Pixel 7 Build/AP3A) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36')).toBe('Android 15');
  });
  it('trình duyệt => tên + số chính; lạ => "Web"; không có tên máy hay chuỗi dài', () => {
    expect(osLabel('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36')).toBe('Chrome 120');
    expect(osLabel('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36 Edg/119.0.0.0')).toBe('Edge 119');
    expect(osLabel('Mozilla/5.0 (Macintosh) Version/17.2 Safari/605.1.15')).toBe('Safari 17');
    expect(osLabel('curl/8')).toBe('Web');
    expect(osLabel('')).toBe('Web');
  });
});

describe('errorReport', () => {
  it('tên lỗi + dòng khung đầu của stack; bỏ máy chủ và tham số truy vấn', () => {
    const e = new Error('Cannot read properties of undefined (email a@b.com)');
    e.name = 'TypeError';
    e.stack = 'TypeError: Cannot read properties of undefined (email a@b.com)\n    at Foo (https://app.example.com/assets/Foo-1a2b.js:10:5?token=zzz)\n    at Bar (x.js:1:1)';
    const r = errorReport(e);
    expect(r.name).toBe('TypeError');
    expect(r.firstFrame).toBe('at Foo (/assets/Foo-1a2b.js:10:5)');
    expect(JSON.stringify(r)).not.toContain('a@b.com');
    expect(JSON.stringify(r)).not.toContain('token');
  });
  it('không có stack => firstFrame rỗng; tên dài bị cắt; luôn hợp lệ với contract (name ≥1, ≤100; frame ≤300)', () => {
    const e = new Error('x');
    e.name = 'N'.repeat(500);
    e.stack = undefined;
    const r = errorReport(e);
    expect(r.name.length).toBe(100);
    expect(r.firstFrame).toBe('');
    expect(errorReport({}).name).toBe('Error');
    const long = new Error('x');
    long.stack = 'Error: x\n    at ' + 'a'.repeat(1000);
    expect(errorReport(long).firstFrame.length).toBeLessThanOrEqual(300);
  });
});
