import type { DeviceSettings, ThemeChoice } from '@vietlearning/state';

export type AppTheme = 'dark' | 'light';

/** Màu thanh trạng thái/`theme-color` theo giao diện (khớp --ct-canvas của packages/ui) */
export const THEME_COLOR: Record<AppTheme, string> = { dark: '#1F1710', light: '#FBF3E4' };

export const resolveTheme = (choice: ThemeChoice, prefersDark: boolean): AppTheme =>
  choice === 'system' ? (prefersDark ? 'dark' : 'light') : choice;

/** Phần tử gốc tối thiểu cần dùng (để test không cần DOM) */
export interface RootLike {
  setAttribute(k: string, v: string): void;
  removeAttribute(k: string): void;
  getAttribute(k: string): string | null;
}

/**
 * Gắn giao diện + giảm chuyển động lên <html>. Chỉ ghi khi khác: ghi lại cùng giá trị ở gốc tài liệu vẫn
 * có thể buộc tính lại style toàn trang.
 */
export function applyDocumentSettings(root: RootLike, s: Pick<DeviceSettings, 'theme' | 'reducedMotion'>, prefersDark: boolean): AppTheme {
  const theme = resolveTheme(s.theme, prefersDark);
  if (root.getAttribute('data-theme') !== theme) root.setAttribute('data-theme', theme);
  if (s.reducedMotion) {
    if (root.getAttribute('data-reduced-motion') !== 'true') root.setAttribute('data-reduced-motion', 'true');
  } else if (root.getAttribute('data-reduced-motion') !== null) root.removeAttribute('data-reduced-motion');
  return theme;
}

interface StoreLike {
  getState(): DeviceSettings;
  subscribe(l: (s: DeviceSettings, prev: DeviceSettings) => void): () => void;
}
interface MusicLike {
  start(): void;
  stop(): void;
  setTrack(t: DeviceSettings['musicTrack']): void;
  setVolume(v: number): void;
}

/** Cài đặt nhạc đổi ⇒ báo cho bộ điều phối âm thanh (màn Cài đặt chỉ ghi deviceSettings, không gọi music trực tiếp) */
export function bindMusicSettings(store: StoreLike, music: MusicLike): () => void {
  return store.subscribe((s, prev) => {
    if (s.music !== prev.music) {
      if (s.music) music.start();
      else music.stop();
    }
    if (s.musicTrack !== prev.musicTrack) music.setTrack(s.musicTrack);
    if (s.musicVolume !== prev.musicVolume) music.setVolume(s.musicVolume);
  });
}
