// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLang, shouldSuggestEnglish } from '../src/lang';

afterEach(() => vi.restoreAllMocks());

describe('setLang', () => {
  it('localStorage ném lỗi => vẫn đổi lang, không ném', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bị chặn');
    });
    expect(() => setLang('en')).not.toThrow();
    expect(document.documentElement.lang).toBe('en');
  });
  it('lưu lựa chọn khi được phép', () => {
    setLang('vi');
    expect(localStorage.getItem('landing-lang')).toBe('vi');
  });
});

describe('shouldSuggestEnglish', () => {
  it('trình duyệt en, trang vi, chưa chọn => gợi ý', () => {
    localStorage.clear();
    expect(shouldSuggestEnglish('vi', 'en-US')).toBe(true);
  });
  it('trình duyệt vi => không gợi ý', () => {
    expect(shouldSuggestEnglish('vi', 'vi-VN')).toBe(false);
  });
  it('đã chọn vi trước đó => không gợi ý', () => {
    localStorage.setItem('landing-lang', 'vi');
    expect(shouldSuggestEnglish('vi', 'en-US')).toBe(false);
  });
  it('trang en thì không gợi ý', () => {
    localStorage.clear();
    expect(shouldSuggestEnglish('en', 'en-US')).toBe(false);
  });
  it('localStorage bị chặn khi đọc => vẫn trả lời, không ném', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bị chặn');
    });
    expect(shouldSuggestEnglish('vi', 'fr')).toBe(true);
  });
});
