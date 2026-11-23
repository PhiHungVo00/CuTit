import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { learnerStore } from '@vietlearning/state';
import { DrillScreen } from './DrillScreen';

const sfx = vi.hoisted(() => ({ playSfx: vi.fn(), haptic: vi.fn() }));
vi.mock('@vietlearning/shared/audio', () => sfx);
vi.mock('@vietlearning/native', () => ({ getDeviceSpeech: () => ({ speak: vi.fn(async () => undefined) }) }));
vi.mock('./generateDrills', () => ({
  generateSession: () => [
    { key: 'q1', type: 'quiz', prompt: 'Chọn', options: ['a', 'b'], answer: 'a', explanation: '' },
    { key: 'r1', type: 'repeat', prompt: 'Đọc', text: 'xin chào', translation: 'hello' }
  ]
}));

beforeEach(() => {
  sfx.playSfx.mockClear();
  sfx.haptic.mockClear();
  learnerStore.getState().reset();
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
});
afterEach(cleanup);

const mood = () => screen.getAllByRole('img').map((i) => i.getAttribute('alt') ?? '').join('|');

describe('M5 phản hồi Cu Tít', () => {
  it('chọn sai => âm sai + động viên; tự chấm dễ => âm đúng; xong phiên => hoàn thành + ăn mừng', () => {
    render(
      <MemoryRouter>
        <DrillScreen />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'b' }));
    expect(sfx.playSfx).toHaveBeenLastCalledWith('sai');
    expect(sfx.haptic).toHaveBeenLastCalledWith('loi');
    expect(mood()).toMatch(/động viên/);
    fireEvent.click(screen.getByRole('button', { name: /Tiếp/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Dễ' }));
    expect(sfx.playSfx).toHaveBeenCalledWith('dung');
    expect(sfx.playSfx).toHaveBeenLastCalledWith('hoan-thanh');
    expect(mood()).toMatch(/ăn mừng/);
  });
});
