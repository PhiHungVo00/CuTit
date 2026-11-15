/**
 * Đa ngôn ngữ giao diện (vi/en) siêu nhẹ, thay cho i18next.
 *
 * Vì sao không dùng i18next như TDD: i18next + react-i18next thêm ~15 kB gzip vào lần tải đầu trong khi
 * ngân sách còn ~2.4 kB (65.6/68 kB). Ở đây mỗi MFE tự giữ từ điển của mình (nằm trong chunk lazy
 * của màn hình đó), chỉ chuỗi của Shell nằm ở bundle đầu. Không có pluralization phức tạp: tiếng Việt
 * không chia số nhiều, tiếng Anh dùng khóa riêng khi cần.
 *
 * Kiểu an toàn: từ điển `en` phải có ĐÚNG các khóa của `vi` (thiếu/thừa => lỗi biên dịch).
 */
import { useCallback } from 'react';
import { learnerStore, useLearner, type UiLanguage } from './index.js';

export type MessageVars = Record<string, string | number>;

function format(template: string, vars?: MessageVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export interface Messages<K extends string> {
  /** Hook cho component: re-render khi đổi ngôn ngữ */
  useT(): (key: K, vars?: MessageVars) => string;
  /** Dùng ngoài React (hàm thuần, thông báo lỗi…): đọc ngôn ngữ hiện tại */
  t(key: K, vars?: MessageVars): string;
}

export function defineMessages<const V extends Record<string, string>>(vi: V, en: { [K in keyof V]: string }): Messages<Extract<keyof V, string>> {
  type K = Extract<keyof V, string>;
  const dicts: Record<UiLanguage, Record<string, string>> = { vi, en };
  const lookup = (lang: UiLanguage, key: K, vars?: MessageVars) => format(dicts[lang]?.[key] ?? vi[key] ?? key, vars);
  return {
    useT() {
      const lang = useLearner((s) => s.preferences.uiLanguage);
      return useCallback((key: K, vars?: MessageVars) => lookup(lang, key, vars), [lang]);
    },
    t: (key, vars) => lookup(learnerStore.getState().preferences.uiLanguage, key, vars)
  };
}

/** Hook đọc ngôn ngữ giao diện hiện tại */
export function useUiLanguage(): UiLanguage {
  return useLearner((s) => s.preferences.uiLanguage);
}
