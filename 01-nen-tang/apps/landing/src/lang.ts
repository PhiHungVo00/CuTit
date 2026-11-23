export type Lang = 'vi' | 'en';
const KEY = 'landing-lang';

/** Đọc lựa chọn đã lưu; trình duyệt chặn localStorage thì coi như chưa chọn */
export function getSavedLang(): Lang | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'vi' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

/** Đổi ngôn ngữ trang + nhớ lựa chọn. Không ném lỗi khi localStorage bị chặn (chỉ không nhớ) */
export function setLang(lang: Lang): void {
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* cửa sổ ẩn danh / Safari chặn: bỏ qua */
  }
}

/** Gợi ý "View in English?" chỉ ở trang vi, khi trình duyệt không phải vi và người dùng chưa chọn vi */
export function shouldSuggestEnglish(pageLang: Lang, browserLanguage: string): boolean {
  if (pageLang !== 'vi') return false;
  if (/^vi\b/i.test(browserLanguage)) return false;
  return getSavedLang() !== 'vi';
}
