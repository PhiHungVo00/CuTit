import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setDeviceSettings, useDeviceSettings } from '@vietlearning/state';
import { applySystemBars } from '../native/bootstrap';
import { THEME_COLOR, applyDocumentSettings, resolveTheme, type AppTheme } from './deviceBindings';

export type { AppTheme };

interface ThemeValue {
  /** Giao diện đang áp dụng (đã giải 'system') */
  theme: AppTheme;
  setTheme: (t: AppTheme) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Giao diện là cài đặt THEO MÁY (`deviceSettings`): Shell đọc, gắn data-theme / data-reduced-motion lên <html>
 * để thanh tab và mọi màn hình đổi cùng lúc qua CSS variables. 'system' theo prefers-color-scheme.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const choice = useDeviceSettings((s) => s.theme);
  const reducedMotion = useDeviceSettings((s) => s.reducedMotion);
  const [prefersDark, setPrefersDark] = useState(() => window.matchMedia?.(DARK_QUERY).matches ?? false);
  const theme = resolveTheme(choice, prefersDark);

  useEffect(() => {
    if (choice !== 'system' || !window.matchMedia) return;
    const mq = window.matchMedia(DARK_QUERY);
    const on = () => setPrefersDark(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [choice]);

  useEffect(() => {
    applyDocumentSettings(document.documentElement, { theme: choice, reducedMotion }, prefersDark);
    applySystemBars(theme); // app Android: dải status/navigation bar đổi theo
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta && themeMeta.getAttribute('content') !== THEME_COLOR[theme]) themeMeta.setAttribute('content', THEME_COLOR[theme]);
  }, [choice, reducedMotion, prefersDark, theme]);

  const setTheme = useCallback((t: AppTheme) => setDeviceSettings({ theme: t }), []);
  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAppTheme phải nằm trong <ThemeProvider>');
  return ctx;
}
