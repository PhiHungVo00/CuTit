import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { LocalReminders, ReminderItem } from '@vietlearning/native';
import { dayKey, learnerStore } from '@vietlearning/state';
import { progressStore } from '@vietlearning/state/progress';
import { enableReminders, reminderTexts, syncReminders } from './reminders';
import { GoalPanel } from './GoalPanel';

function fake(granted = true) {
  const scheduled: ReminderItem[][] = [];
  const r: LocalReminders & { scheduled: ReminderItem[][] } = {
    scheduled,
    supported: () => true,
    requestPermission: vi.fn(async () => granted),
    schedule: vi.fn(async (items: ReminderItem[]) => void scheduled.push(items)),
    cancelAll: vi.fn(async () => undefined)
  };
  return r;
}

const NOW = new Date('2026-11-18T10:00:00');

beforeEach(() => {
  learnerStore.getState().reset();
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
  progressStore.getState().resetProgress();
});
afterEach(cleanup);

describe('nhắc học cục bộ', () => {
  it('chỉ xin quyền khi bấm “Bật nhắc”, không xin lúc mở bảng', async () => {
    const r = fake();
    render(<GoalPanel reminders={r} />);
    expect(r.requestPermission).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Bật nhắc' }));
    await vi.waitFor(() => expect(r.requestPermission).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(progressStore.getState().reminder.enabled).toBe(true));
  });

  it('bị từ chối quyền => không bật, báo nhẹ nhàng', async () => {
    const r = fake(false);
    expect(await enableReminders(r, NOW)).toBe(false);
    expect(progressStore.getState().reminder.enabled).toBe(false);
    expect(r.schedule).not.toHaveBeenCalled();
  });

  it('đặt 7 mốc; đã đạt mục tiêu hôm nay => không nhắc hôm nay', async () => {
    const r = fake();
    await enableReminders(r, NOW);
    expect(r.scheduled.at(-1)).toHaveLength(7);
    expect(dayKey(r.scheduled.at(-1)![0].at)).toBe('2026-11-18');
    learnerStore.getState().addStudyTime(10 * 60, NOW);
    await syncReminders(r, NOW);
    expect(r.scheduled.at(-1)).toHaveLength(6);
    expect(dayKey(r.scheduled.at(-1)![0].at)).toBe('2026-11-19');
    expect(new Set(r.scheduled.at(-1)!.map((x) => x.id)).size).toBe(6);
  });

  it('tắt nhắc => hủy hết; web không hỗ trợ => ẩn tùy chọn nhắc', async () => {
    const r = fake();
    await enableReminders(r, NOW);
    progressStore.getState().setReminder({ enabled: false });
    await syncReminders(r, NOW);
    expect(r.cancelAll).toHaveBeenCalled();
    render(<GoalPanel reminders={{ ...r, supported: () => false }} />);
    expect(screen.queryByRole('button', { name: 'Bật nhắc' })).toBeNull();
  });

  it('lời nhắc trung tính, song ngữ, không gây tội lỗi', () => {
    const banned = /buồn|thất vọng|mất chuỗi|sad|disappoint|lose your streak/i;
    for (const lang of ['vi', 'en'] as const) {
      learnerStore.getState().setPreferences({ uiLanguage: lang });
      for (let i = 0; i < 7; i++) {
        const { title, body } = reminderTexts(i);
        expect(title.length).toBeGreaterThan(0);
        expect(`${title} ${body}`).not.toMatch(banned);
      }
    }
    expect(reminderTexts(0).title).toBe('Time for Vietnamese');
  });
});
