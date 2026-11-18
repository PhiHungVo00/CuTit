import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { COURSE } from '@vietlearning/content';
import { dayKey, learnerStore } from '@vietlearning/state';
import { progressStore } from '@vietlearning/state/progress';
import { badgeFacts } from './facts';
import { BadgeNotice, MotivationPanel } from './Motivation';

const NOW = new Date('2026-11-18T10:00:00'); // Thứ Tư
const ago = (n: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return dayKey(d);
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  learnerStore.getState().reset();
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
  progressStore.getState().resetProgress();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('badgeFacts (dữ liệu khóa học => luật huy hiệu)', () => {
  it('mỗi unit có danh sách bài + bài nhập vai; đủ 6 thanh', () => {
    const f = badgeFacts(COURSE);
    expect(f.tones).toHaveLength(6);
    expect(f.units.map((u) => u.id)).toEqual(['u1', 'u2', 'u3']);
    expect(f.units[0].lessonIds).toContain('u1l1');
    expect(f.units[0].roleplayIds).toEqual(['u1l5']);
  });
});

describe('BadgeNotice — thông báo nhẹ khi đạt', () => {
  it('đạt huy hiệu => một dòng thông báo; bấm “Đã xem” thì ẩn và không báo lại', () => {
    progressStore.setState({ testedOut: { u1: NOW.toISOString() } });
    render(<BadgeNotice />);
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Huy hiệu mới');
    expect(status.textContent).toContain('Xong unit 1');
    expect(status.textContent).toContain('Vượt rào');
    fireEvent.click(screen.getByRole('button', { name: 'Đã xem' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(Object.values(progressStore.getState().badges).every((b) => b.seen)).toBe(true);
  });

  it('đạt trong lúc đang mở (store đổi) => hiện ngay', () => {
    render(<BadgeNotice />);
    expect(screen.queryByRole('status')).toBeNull();
    act(() => void progressStore.setState({ testedOut: { u2: NOW.toISOString() } }));
    expect(screen.getByRole('status').textContent).toContain('Xong unit 2');
  });

  it('huy hiệu về từ máy khác (đã xem) => không thông báo', () => {
    progressStore.setState({ badges: { cards25: { at: NOW.toISOString(), seen: true } } });
    render(<BadgeNotice />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('MotivationPanel — tổng kết tuần + huy hiệu', () => {
  it('tổng kết tuần so với tuần trước của chính mình', () => {
    learnerStore.setState({ activity: { [ago(0)]: 900, [ago(4)]: 300 } });
    progressStore.setState({ lessonsByDay: { [ago(1)]: 2, [ago(5)]: 1 }, knownAt: { a: ago(0) } });
    render(<MotivationPanel />);
    const week = screen.getByRole('region', { name: 'Tổng kết tuần' });
    expect(week.textContent).toContain('15 phút');
    expect(week.textContent).toContain('tuần trước 5 phút');
    expect(week.textContent).toContain('2 bài');
    expect(week.textContent).toContain('1 từ');
    expect(week.textContent).not.toMatch(/hạng|người khác/);
  });

  it('chưa có tuần trước => nói rõ; thanh tiến bộ nhất khi có', () => {
    progressStore.setState({
      toneWeek: { week: '2026-11-16', base: { sac: { n: 2, sum: 120 } } },
      toneStats: { sac: { n: 4, sum: 300 } }
    });
    render(<MotivationPanel />);
    const week = screen.getByRole('region', { name: 'Tổng kết tuần' });
    expect(week.textContent).toContain('Chưa có số liệu tuần trước');
    expect(week.textContent).toContain('Thanh sắc');
    expect(week.textContent).toContain('+30');
  });

  it('danh sách huy hiệu: đã có / còn thiếu bao nhiêu', () => {
    const srs: Record<string, ReturnType<typeof learnerStore.getState>['srs'][string]> = {};
    for (let i = 0; i < 10; i++) srs[`w${i}`] = { itemRef: `w${i}`, front: 'a', back: 'b', ease: 250, intervalDays: 30, repetitions: 4, dueAt: NOW.toISOString(), source: 'drill' };
    learnerStore.setState({ srs });
    progressStore.setState({ badges: { testout: { at: NOW.toISOString(), seen: true } } });
    render(<MotivationPanel />);
    fireEvent.click(screen.getByText(/Huy hiệu \(1\/8\)/));
    const list = screen.getByRole('list', { name: 'Huy hiệu' });
    expect(list.textContent).toContain('Vượt rào');
    expect(list.textContent).toContain('Đã có');
    expect(list.textContent).toContain('10/25');
    expect(list.textContent).toContain('còn 15');
  });
});
