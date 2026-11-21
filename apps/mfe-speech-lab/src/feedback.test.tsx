import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { learnerStore } from '@vietlearning/state';

const sfx = vi.hoisted(() => [] as string[]);
const rec = vi.hoisted(() => ({ value: { status: 'idle', error: null, result: null as unknown, level: 0, start: vi.fn(), stop: vi.fn() } }));
vi.mock('@vietlearning/shared/audio', () => ({ playSfx: (n: string) => sfx.push(n) }));
vi.mock('@vietlearning/native', () => ({ canOpenAppSettings: () => false, openAppSettings: vi.fn(), getDeviceSpeech: () => ({ speak: vi.fn(async () => undefined) }) }));
vi.mock('@vietlearning/exercises', async (orig) => ({
  ...(await orig<typeof import('@vietlearning/exercises')>()),
  playText: vi.fn(async () => undefined),
  prefetchPack: vi.fn(async () => undefined),
  useToneRecorder: () => rec.value,
  ContourChart: () => null
}));

import { minimalPairQuestion } from './gym/toneGymModel';
import { ToneGymScreen } from './gym/ToneGymScreen';
import { ToneLabScreen } from './components/ToneLabScreen';

const mood = (m: string) => (screen.queryAllByRole('img') as HTMLImageElement[]).some((i) => i.src.includes(`cutit-${m}`));

beforeEach(() => {
  sfx.length = 0;
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
  window.history.pushState({}, '', '/?seed=7');
});
afterEach(() => {
  cleanup();
  learnerStore.getState().reset();
});

describe('Phòng tập thanh điệu: phản hồi đúng/sai', () => {
  it('chọn đúng ⇒ sfx "dung" + Cu Tít "khen"', () => {
    render(<ToneGymScreen />);
    const q = minimalPairQuestion(7);
    fireEvent.click(screen.getByRole('button', { name: q.options.find((o) => o.tone === q.answer)!.vi }));
    expect(sfx).toEqual(['dung']);
    expect(mood('khen')).toBe(true);
  });

  it('chọn sai ⇒ sfx "sai" + Cu Tít "dong-vien"', () => {
    render(<ToneGymScreen />);
    const q = minimalPairQuestion(7);
    fireEvent.click(screen.getByRole('button', { name: q.options.find((o) => o.tone !== q.answer)!.vi }));
    expect(sfx).toEqual(['sai']);
    expect(mood('dong-vien')).toBe(true);
  });
});

describe('Luyện thanh điệu bằng giọng: phản hồi theo điểm', () => {
  const withResult = (score: number, bestMatch: string) => {
    rec.value = { ...rec.value, status: 'done', result: { contour: [], targetScore: { score }, bestMatch, medianHz: 200, processingMs: 5 } };
  };
  it('điểm tốt và đúng thanh ⇒ "dung" + "khen"', () => {
    withResult(90, 'sac');
    render(<ToneLabScreen />);
    expect(sfx).toEqual(['dung']);
    expect(mood('khen')).toBe(true);
  });
  it('điểm thấp ⇒ "sai" + "dong-vien"', () => {
    withResult(20, 'huyen');
    render(<ToneLabScreen />);
    expect(sfx).toEqual(['sai']);
    expect(mood('dong-vien')).toBe(true);
  });
});
