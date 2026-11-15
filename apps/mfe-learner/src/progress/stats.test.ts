import { describe, expect, it } from 'vitest';
import { formatDue, lastSevenDays, nextDue } from './stats';

describe('thống kê M9', () => {
  const today = new Date(2026, 10, 15, 20, 0); // CN 15/11/2026

  it('7 ngày gần nhất: đúng thứ tự, đổi giây => phút, hôm nay ở cuối', () => {
    const days = lastSevenDays({ '2026-11-15': 600, '2026-11-09': 90, '2026-11-08': 6000 }, today);
    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ key: '2026-11-09', label: 'T2', minutes: 2 });
    expect(days[6]).toMatchObject({ key: '2026-11-15', label: 'Nay', minutes: 10, isToday: true });
    expect(days.some((d) => d.key === '2026-11-08')).toBe(false);
  });

  it('qua đầu tháng vẫn đúng ngày', () => {
    const days = lastSevenDays({}, new Date(2026, 11, 2));
    expect(days.map((d) => d.key)).toEqual(['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
  });

  it('thẻ sắp đến hạn sớm nhất, bỏ qua thẻ đã đến hạn', () => {
    const srs = {
      a: { dueAt: new Date(2026, 10, 14).toISOString() },
      b: { dueAt: new Date(2026, 10, 18).toISOString() },
      c: { dueAt: new Date(2026, 10, 16, 9).toISOString() }
    };
    const d = nextDue(srs, today)!;
    expect(d.getDate()).toBe(16);
    expect(formatDue(d, today)).toBe('ngày mai');
    expect(nextDue({}, today)).toBeNull();
  });
});
