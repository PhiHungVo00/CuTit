import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { dayKey, learnerStore } from '@vietlearning/state';
import { progressStore } from '@vietlearning/state/progress';
import { ProfileScreen } from './ProfileScreen';

const lang = (uiLanguage: 'vi' | 'en') => learnerStore.getState().setPreferences({ uiLanguage });
const show = () =>
  render(
    <MemoryRouter>
      <ProfileScreen />
    </MemoryRouter>
  );

beforeEach(() => lang('vi'));
afterEach(() => {
  cleanup();
  learnerStore.getState().reset();
  progressStore.getState().resetProgress();
});

describe('ProfileScreen (phương án B)', () => {
  it('hiện 4 số liệu: chuỗi ngày, phút học, từ đã thuộc, huy hiệu', () => {
    const today = dayKey(new Date());
    learnerStore.setState({
      activity: { [today]: 600 },
      srs: {
        a: { itemRef: 'a', front: 'a', back: 'a', source: 'dialect', ease: 250, intervalDays: 30, repetitions: 5, dueAt: new Date().toISOString() },
        b: { itemRef: 'b', front: 'b', back: 'b', source: 'dialect', ease: 250, intervalDays: 0, repetitions: 0, dueAt: new Date().toISOString() }
      }
    });
    progressStore.setState({ badges: { x: { at: '2026-11-01T00:00:00.000Z', seen: true } } });
    show();
    const stats = screen.getByRole('list', { name: 'Số liệu của bạn' });
    expect(within(stats).getAllByRole('listitem')).toHaveLength(4);
    const value = (label: string) => within(stats).getByText(label).parentElement?.textContent ?? '';
    expect(value('Chuỗi ngày')).toContain('1 ngày');
    expect(value('Phút học')).toContain('10 phút');
    expect(value('Từ đã thuộc')).toContain('1');
    expect(value('Huy hiệu')).toContain('1');
  });

  it('mục cuối của danh sách là Cài đặt, trỏ tới /cai-dat (vi và en)', () => {
    show();
    let links = screen.getAllByRole('link');
    expect(links[links.length - 1].textContent).toContain('Cài đặt');
    expect(links[links.length - 1].getAttribute('href')).toBe('/cai-dat');
    cleanup();
    lang('en');
    show();
    links = screen.getAllByRole('link');
    expect(links[links.length - 1].textContent).toContain('Settings');
  });

  it('có lối vào Bạn bè và Tiến độ', () => {
    show();
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/ban-be');
    expect(hrefs).toContain('/tien-do');
  });
});
