import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { learnerStore } from '@vietlearning/state';
import { ProgressScreen } from './ProgressScreen';
import { ReviewSession } from './ReviewSession';

const playSfx = vi.hoisted(() => vi.fn());
vi.mock('@vietlearning/shared/audio', () => ({ playSfx, haptic: vi.fn() }));
vi.mock('@vietlearning/native', () => ({ getDeviceSpeech: () => ({ speak: async () => undefined }) }));

const card = (n: string) => ({ itemRef: n, front: n, back: n, source: 'dialect' as const, ease: 250, intervalDays: 0, repetitions: 0, dueAt: new Date(Date.now() - 1000).toISOString() });

beforeEach(() => {
  playSfx.mockClear();
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
});
afterEach(() => {
  cleanup();
  learnerStore.getState().reset();
});

const review = (cards = [card('a'), card('b')]) => {
  learnerStore.setState({ srs: Object.fromEntries(cards.map((c) => [c.itemRef, c])) });
  return render(<ReviewSession cards={cards} onClose={() => {}} />);
};
const flip = () => fireEvent.click(screen.getByRole('button', { name: /^Lật/ }));

describe('Ôn thẻ: phản hồi Cu Tít', () => {
  it('nhớ ⇒ playSfx("dung") + Cu Tít khen', () => {
    review();
    flip();
    fireEvent.click(screen.getByRole('button', { name: /^Nhớ$/ }));
    expect(playSfx).toHaveBeenLastCalledWith('dung');
    expect(screen.getByRole('img', { name: /khen/ })).toBeTruthy();
  });

  it('quên ⇒ playSfx("sai") + Cu Tít động viên', () => {
    review();
    flip();
    fireEvent.click(screen.getByRole('button', { name: /^Quên/ }));
    expect(playSfx).toHaveBeenLastCalledWith('sai');
    expect(screen.getByRole('img', { name: /động viên/ })).toBeTruthy();
  });

  it('xong lượt ôn ⇒ playSfx("hoan-thanh") + Cu Tít ăn mừng', () => {
    review([card('a')]);
    flip();
    fireEvent.click(screen.getByRole('button', { name: /^Quên/ }));
    expect(playSfx).toHaveBeenCalledWith('hoan-thanh');
    expect(screen.getByRole('img', { name: /ăn mừng/ })).toBeTruthy();
  });
});

describe('Tiến độ: trạng thái rỗng có Cu Tít', () => {
  const show = () => render(<MemoryRouter><ProgressScreen /></MemoryRouter>);
  it('chưa có thẻ ⇒ Cu Tít ngủ', () => {
    show();
    expect(screen.getByRole('img', { name: /ngủ/ })).toBeTruthy();
  });
  it('có thẻ đến hạn ⇒ Cu Tít nhắc học', () => {
    learnerStore.setState({ srs: { a: card('a') } });
    show();
    expect(screen.getByRole('img', { name: /nhắc/ })).toBeTruthy();
  });
});

describe('mfe-learner phần Tiến độ / Làm quen: không emoji làm icon', () => {
  it('mã nguồn sạch emoji', () => {
    const emoji = /\p{Extended_Pictographic}/u;
    const files = ['progress', 'onboarding'].flatMap((d) => readdirSync(join(__dirname, '..', d)).map((f) => join(__dirname, '..', d, f)));
    files.push(join(__dirname, '..', 'listen.tsx'));
    const bad = files.filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f) && statSync(f).isFile() && emoji.test(readFileSync(f, 'utf8'))).map((f) => f.replace(/.*src[\/]/, ''));
    expect(bad).toEqual([]);
  });
});
