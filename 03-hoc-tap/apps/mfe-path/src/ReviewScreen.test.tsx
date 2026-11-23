import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { learnerStore } from '@vietlearning/state';
import { progressStore } from '@vietlearning/state/progress';
import { ReviewScreen } from './ReviewScreen';

vi.mock('@vietlearning/shared/audio', () => ({ playSfx: vi.fn(), haptic: vi.fn() }));
vi.mock('@vietlearning/exercises', () => ({ prefetchPack: vi.fn(async () => undefined) }));

const show = () =>
  render(
    <MemoryRouter>
      <ReviewScreen />
    </MemoryRouter>
  );

beforeEach(() => {
  learnerStore.getState().reset();
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
  progressStore.getState().resetProgress();
});
afterEach(cleanup);

describe('Ôn tập rỗng (P1-3)', () => {
  it('chưa có thẻ/lỗi/thanh yếu => Cu Tít ngủ + lời mời + nút về lộ trình, không còn ba khối “(0)”', () => {
    const { container } = show();
    expect(screen.getByRole('heading', { name: 'Chưa có gì để ôn' })).toBeTruthy();
    expect(container.querySelector('img')!.getAttribute('src')).toContain('cutit-ngu');
    expect(screen.getByRole('link', { name: 'Về lộ trình' }).getAttribute('href')).toBe('/');
    expect(screen.queryByText(/Thẻ đến hạn \(0\)/)).toBeNull();
  });

  it('có thẻ chưa đến hạn => Cu Tít khen “ôn xong rồi”', () => {
    const later = new Date(Date.now() + 86_400_000).toISOString();
    learnerStore.setState({ srs: { a: { itemRef: 'a', front: 'a', back: 'a', source: 'drill', ease: 250, intervalDays: 3, repetitions: 1, dueAt: later } } });
    const { container } = show();
    expect(screen.getByRole('heading', { name: 'Hôm nay ôn xong rồi!' })).toBeTruthy();
    expect(container.querySelector('img')!.getAttribute('src')).toContain('cutit-khen');
  });

  it('có thẻ đến hạn => vẫn hiện khối thẻ đến hạn, không hiện trạng thái rỗng', () => {
    learnerStore.setState({ srs: { a: { itemRef: 'a', front: 'a', back: 'a', source: 'drill', ease: 250, intervalDays: 0, repetitions: 0, dueAt: new Date(Date.now() - 1000).toISOString() } } });
    show();
    expect(screen.getByRole('button', { name: 'Ôn 1 thẻ' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Chưa có gì để ôn' })).toBeNull();
  });
});
