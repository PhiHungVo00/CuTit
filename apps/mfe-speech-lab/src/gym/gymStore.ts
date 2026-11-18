import { useSyncExternalStore } from 'react';
import type { ToneId } from '@vietlearning/content';
import { safeStorage } from '@vietlearning/state';
import { recordListen, type ListenByDay } from './toneGymModel';

/**
 * Kết quả nghe của phòng tập thanh điệu, lưu cục bộ (khóa `becutit.toneGym`, 30 ngày gần nhất).
 * Store riêng của MFE: không đụng store tiến độ (`becutit.progress`) và hàng đợi đồng bộ của phiên khác.
 * Chưa đồng bộ lên server (ghi trong nhật ký GĐ2).
 */
const KEY = 'becutit.toneGym';
const storage = safeStorage();
const listeners = new Set<() => void>();

function load(): ListenByDay {
  try {
    const raw = storage.getItem(KEY);
    const parsed = typeof raw === 'string' ? (JSON.parse(raw) as { byDay?: ListenByDay }) : null;
    return parsed?.byDay && typeof parsed.byDay === 'object' ? parsed.byDay : {};
  } catch {
    return {};
  }
}

let byDay: ListenByDay = load();

export const gymStore = {
  get: () => byDay,
  record(tone: ToneId, correct: boolean, now = new Date()) {
    byDay = recordListen(byDay, tone, correct, now);
    try {
      void storage.setItem(KEY, JSON.stringify({ version: 1, byDay }));
    } catch {
      /* hết chỗ / chế độ riêng tư: vẫn giữ trong RAM */
    }
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  }
};

export const useGymByDay = () => useSyncExternalStore(gymStore.subscribe, gymStore.get, gymStore.get);
