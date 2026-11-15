import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type AppTheme = 'dark' | 'light';

const STORAGE_KEY = 'becutit.theme';
const META_COLOR: Record<AppTheme, string> = { dark: '#16100B', light: '#F6F3EC' };

function readStoredTheme(): AppTheme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'dark';
  } catch {
    return 'dark'; // chế độ riêng tư / bị chặn storage
  }
}

interface ThemeValue {
  theme: AppTheme;
  setTheme: (t: AppTheme) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/**
 * Giao diện của toàn app là "state slice" do Host cấp (Nguyên tắc 7): Shell giữ, lưu lại,
 * gắn data-theme lên <html> để thanh tab và mọi màn hình đổi cùng lúc qua CSS variables.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(readStoredTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOR[theme]);
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme);
  }, [theme]);

  const setTheme = useCallback((t: AppTheme) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* không lưu được thì vẫn đổi trong phiên hiện tại */
    }
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAppTheme phải nằm trong <ThemeProvider>');
  return ctx;
}
