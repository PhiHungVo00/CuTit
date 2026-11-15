import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Năng lực "mở Cài đặt của app" (để người dùng tự bật lại quyền đã từ chối vĩnh viễn).
 * Android: plugin nội bộ AppSettingsPlugin.java. Trình duyệt / iOS: chưa hỗ trợ => canOpenAppSettings() = false.
 */
interface AppSettingsPlugin {
  open(): Promise<void>;
}

const AppSettings = registerPlugin<AppSettingsPlugin>('AppSettings');

export function canOpenAppSettings(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/** Trả về true nếu đã mở được trang Cài đặt. (Không trả proxy plugin từ hàm async.) */
export async function openAppSettings(): Promise<boolean> {
  if (!canOpenAppSettings()) return false;
  try {
    await AppSettings.open();
    return true;
  } catch {
    return false;
  }
}
