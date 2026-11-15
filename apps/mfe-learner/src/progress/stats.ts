import { dayKey } from '@vietlearning/state';

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** 7 ngày gần nhất (cũ → mới, ngày cuối là hôm nay): phút học mỗi ngày */
export function lastSevenDays(activity: Record<string, number>, today = new Date()): { key: string; label: string; minutes: number; isToday: boolean }[] {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = dayKey(d);
    out.push({ key, label: i === 0 ? 'Nay' : WEEKDAY[d.getDay()], minutes: Math.round((activity[key] ?? 0) / 60), isToday: i === 0 });
  }
  return out;
}

/** Thời điểm thẻ sớm nhất sắp đến hạn (để nói "thẻ tiếp theo đến hạn lúc …" khi chưa có thẻ nào) */
export function nextDue(srs: Record<string, { dueAt: string }>, now = new Date()): Date | null {
  let best: number | null = null;
  for (const c of Object.values(srs)) {
    const t = new Date(c.dueAt).getTime();
    if (t > now.getTime() && (best === null || t < best)) best = t;
  }
  return best === null ? null : new Date(best);
}

export function formatDue(d: Date, now = new Date()): string {
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);
  if (days <= 0) return 'hôm nay';
  if (days === 1) return 'ngày mai';
  return `${days} ngày nữa`;
}
