/**
 * Đồng bộ lịch nhắc học cục bộ với cài đặt + tiến độ hôm nay. Không có cách chạy mã lúc thông báo bật,
 * nên đặt trước từng mốc (7 ngày tới) và đặt lại khi mở lộ trình, khi xong bài, khi đổi cài đặt:
 * hôm nay đã đạt mục tiêu => bỏ mốc hôm nay. Giờ yên lặng 22h–7h do planReminders kẹp.
 */
import { getLocalReminders, REMINDER_IDS, type LocalReminders } from '@vietlearning/native';
import { dayKey, learnerStore } from '@vietlearning/state';
import { goalProgress, planReminders, progressStore } from '@vietlearning/state/progress';
import { t } from './i18n';

/** Lời nhắc trung tính, xoay vòng theo ngày; theo ngôn ngữ giao diện lúc đặt lịch */
export function reminderTexts(dayIndex: number): { title: string; body: string } {
  const bodies = [t('reminderBody.0'), t('reminderBody.1'), t('reminderBody.2')];
  return { title: t('reminderTitleText'), body: bodies[dayIndex % bodies.length] };
}

export async function syncReminders(r: LocalReminders = getLocalReminders(), now = new Date()): Promise<void> {
  if (!r.supported()) return;
  const { reminder, dailyGoal } = progressStore.getState();
  if (!reminder.enabled) return r.cancelAll();
  const met = goalProgress(learnerStore.getState().activity[dayKey(now)] ?? 0, dailyGoal).met;
  const times = planReminders(reminder, met, now);
  await r.schedule(times.map((at, i) => ({ id: REMINDER_IDS[i], at, ...reminderTexts(at.getDate()) })));
}

/** Người học bấm “Bật nhắc”: lúc này mới xin quyền. Trả false nếu không được phép. */
export async function enableReminders(r: LocalReminders = getLocalReminders(), now = new Date()): Promise<boolean> {
  if (!(await r.requestPermission())) return false;
  progressStore.getState().setReminder({ enabled: true });
  await syncReminders(r, now);
  return true;
}
