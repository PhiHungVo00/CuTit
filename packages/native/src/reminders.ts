import { Capacitor } from '@capacitor/core';

/**
 * Năng lực “nhắc học bằng thông báo cục bộ” (Nguyên tắc 4: gọi reminders.schedule, không gọi tên plugin).
 * - App Capacitor: @capacitor/local-notifications — không cần server/FCM, không cần tài khoản.
 * - Trình duyệt: không hỗ trợ (supported() = false) => giao diện ẩn tùy chọn nhắc.
 * Plugin được import động để không nằm trong bundle đầu.
 * Quyền thông báo chỉ được xin khi người học bấm “Bật nhắc” (requestPermission), không xin lúc mở app.
 */
export interface ReminderItem {
  id: number;
  at: Date;
  title: string;
  body: string;
}

export interface LocalReminders {
  supported(): boolean;
  /** true nếu được phép hiển thị thông báo */
  requestPermission(): Promise<boolean>;
  /** Thay toàn bộ lịch nhắc của app bằng danh sách mới (hủy các mốc cũ trước) */
  schedule(items: ReminderItem[]): Promise<void>;
  cancelAll(): Promise<void>;
}

/** Dải id cố định cho lời nhắc học (tối đa 7 ngày tới) */
export const REMINDER_IDS = [7001, 7002, 7003, 7004, 7005, 7006, 7007] as const;

const load = async () => (await import('@capacitor/local-notifications')).LocalNotifications;

class NativeReminders implements LocalReminders {
  supported(): boolean {
    return true;
  }

  async requestPermission(): Promise<boolean> {
    try {
      const ln = await load();
      const cur = await ln.checkPermissions();
      if (cur.display === 'granted') return true;
      const res = await ln.requestPermissions();
      return res.display === 'granted';
    } catch {
      return false;
    }
  }

  async cancelAll(): Promise<void> {
    try {
      const ln = await load();
      await ln.cancel({ notifications: REMINDER_IDS.map((id) => ({ id })) });
    } catch {
      /* chưa có mốc nào: bỏ qua */
    }
  }

  async schedule(items: ReminderItem[]): Promise<void> {
    await this.cancelAll();
    if (!items.length) return;
    const ln = await load();
    await ln.schedule({
      notifications: items.map((n) => ({ id: n.id, title: n.title, body: n.body, schedule: { at: n.at, allowWhileIdle: true } }))
    });
  }
}

const unsupported: LocalReminders = {
  supported: () => false,
  requestPermission: async () => false,
  schedule: async () => undefined,
  cancelAll: async () => undefined
};

let instance: LocalReminders | null = null;

export function getLocalReminders(): LocalReminders {
  if (!instance) instance = Capacitor.isNativePlatform() ? new NativeReminders() : unsupported;
  return instance;
}
