/**
 * Cài đặt THEO MÁY (giao diện, âm, nhạc, chuyển động): slice cục bộ, KHÔNG đồng bộ.
 * Không nằm trong `partialize` của learnerStore và không đi vào /v1/sync.
 */
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AudioSettings } from '@vietlearning/shared/audio';
import { safeStorage, type Dialect } from './index.js';

export type ThemeChoice = 'light' | 'dark' | 'system';

export interface DeviceSettings extends AudioSettings {
  theme: ThemeChoice;
  reducedMotion: boolean;
  seenBubbleIntro: boolean;
}

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  theme: 'light',
  sfx: true,
  haptics: true,
  music: true,
  musicTrack: 'rotate',
  musicVolume: 0.35,
  reducedMotion: false,
  seenBubbleIntro: false
};

/** Khóa cũ của ThemeContext: người dùng cũ đang để tối thì giữ nguyên khi mở bản mới */
const LEGACY_THEME_KEY = 'becutit.theme';

function initialSettings(): DeviceSettings {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(LEGACY_THEME_KEY) === 'dark') {
      return { ...DEFAULT_DEVICE_SETTINGS, theme: 'dark' };
    }
  } catch {
    /* storage bị chặn: dùng mặc định */
  }
  return { ...DEFAULT_DEVICE_SETTINGS };
}

export const deviceSettingsStore = createStore<DeviceSettings>()(
  persist(() => initialSettings(), {
    name: 'becutit.device',
    version: 1,
    storage: createJSONStorage(safeStorage),
    // Bản lưu cũ thiếu trường mới vẫn nhận mặc định
    merge: (persisted, current) => ({ ...current, ...((persisted ?? {}) as Partial<DeviceSettings>) })
  })
);

export function useDeviceSettings<T>(selector: (s: DeviceSettings) => T): T {
  return useStore(deviceSettingsStore, selector);
}

export function setDeviceSettings(p: Partial<DeviceSettings>): void {
  deviceSettingsStore.setState(p);
}

/** Nhạc nền theo giờ địa phương: 5–11 sáng, 12–17 chiều, còn lại tối */
export function trackForHour(hour: number): 'sang-lang' | 'chieu-dong' | 'trau-ve' {
  if (hour >= 5 && hour < 12) return 'sang-lang';
  if (hour >= 12 && hour < 18) return 'chieu-dong';
  return 'trau-ve';
}

/** Phương ngữ ưu tiên: nguồn đúng là `preferences.dialect`, rỗng thì `profile.dialect` */
export function preferredDialect(s: { profile: { dialect: Dialect }; preferences: { dialect: Dialect | '' } }): Dialect {
  return s.preferences.dialect || s.profile.dialect;
}
