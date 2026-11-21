import { learnerStore } from '@vietlearning/state';
import { progressStore, streakWithFreezes } from '@vietlearning/state/progress';
import { haptic, playSfx } from '@vietlearning/shared/audio';

/** Chuỗi ngày hiện tại (đọc thẳng từ kho; dùng so trước/sau khi ghi một bài) */
export function currentStreak(now = new Date()): number {
  const p = progressStore.getState();
  return streakWithFreezes(learnerStore.getState().activity, p.xpByDay, p.frozenDays, now);
}

/** Gọi MỘT lần ngay sau khi ghi kết quả: âm + rung hoàn thành; lên chuỗi ngày thì thêm âm chuỗi sau tiếng hoàn thành. */
export function celebrateFinish(streakBefore: number): void {
  playSfx('hoan-thanh');
  haptic('thanh-cong');
  if (currentStreak() > streakBefore) setTimeout(() => playSfx('chuoi-ngay'), 900);
}

