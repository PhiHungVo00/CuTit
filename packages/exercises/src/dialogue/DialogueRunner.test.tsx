import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { learnerStore } from '@vietlearning/state';
import type { Dialogue } from '@vietlearning/content';
import { DialogueRunner } from './DialogueRunner';

const sfx = vi.hoisted(() => ({ playSfx: vi.fn(), haptic: vi.fn() }));
vi.mock('@vietlearning/shared/audio', () => sfx);

beforeEach(() => {
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
  sfx.playSfx.mockClear();
});
afterEach(cleanup);

const d: Dialogue = {
  id: 't',
  unit: 'u1',
  aiScenarioId: 'sc5',
  title: 'Gặp hàng xóm',
  titleEn: 'Neighbour',
  reviewed: true,
  start: 'a',
  nodes: [
    {
      id: 'a',
      cutit: 'Bạn chào bác thế nào?',
      cutitEn: 'How do you greet?',
      context: { speakerAge: 20, listenerAge: 50, relation: 'social' },
      a6: { speaker: 'cháu', listener: 'bác' },
      options: [
        { text: 'Cháu chào bác ạ', textEn: 'Hello (polite)', next: 'b', a6: { speaker: 'cháu', listener: 'bác' } },
        { text: 'Tao chào mày', textEn: 'Hello (rude)', next: 'b', a6: { speaker: 'tao', listener: 'mày' } }
      ]
    },
    { id: 'b', cutit: 'Tạm biệt nhé', cutitEn: 'Bye', options: [{ text: 'Tạm biệt bác', textEn: 'Bye', next: 'end-ok' }, { text: 'Hừ', textEn: 'Hmph', next: 'end-retry' }] }
  ]
};

const pick = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Tiếp →' }));

describe('DialogueRunner', () => {
  it('đi hết đường tốt: báo xưng hô, tới end-ok => onDone({passed:true}) và âm hoàn thành', () => {
    const onDone = vi.fn();
    render(<DialogueRunner dialogue={d} onDone={onDone} />);
    expect(screen.getByText('Bạn chào bác thế nào?')).toBeTruthy();
    pick('Cháu chào bác ạ');
    expect(screen.getByRole('status').textContent).toContain('Xưng hô đúng');
    next();
    pick('Tạm biệt bác');
    expect(onDone).toHaveBeenCalledWith({ passed: true, honorificScore: 1 });
    expect(sfx.playSfx).toHaveBeenCalledWith('hoan-thanh');
    expect(sfx.playSfx).toHaveBeenCalledTimes(1);
  });

  it('xưng hô sai: gợi ý cặp đúng, điểm xưng hô giảm nhưng vẫn đi tiếp', () => {
    const onDone = vi.fn();
    render(<DialogueRunner dialogue={d} onDone={onDone} />);
    pick('Tao chào mày');
    expect(screen.getByRole('status').textContent).toContain('cháu – bác');
    next();
    pick('Tạm biệt bác');
    expect(onDone).toHaveBeenCalledWith({ passed: true, honorificScore: 0 });
  });

  it('end-retry: không gọi onDone, có nút Làm lại về nút đầu', () => {
    const onDone = vi.fn();
    render(<DialogueRunner dialogue={d} onDone={onDone} />);
    pick('Cháu chào bác ạ');
    next();
    pick('Hừ');
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Làm lại' }));
    expect(screen.getByText('Bạn chào bác thế nào?')).toBeTruthy();
  });

  it('giao diện tiếng Anh dùng cutitEn/textEn; nút Luyện với Cu Tít gọi onPractice với aiScenarioId', () => {
    learnerStore.getState().setPreferences({ uiLanguage: 'en' });
    const onPractice = vi.fn();
    render(<DialogueRunner dialogue={d} onDone={vi.fn()} onPractice={onPractice} />);
    expect(screen.getByText('How do you greet?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hello (polite)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next →' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bye' }));
    fireEvent.click(screen.getByRole('button', { name: 'Practise with Cu Tít' }));
    expect(onPractice).toHaveBeenCalledWith('sc5');
  });
});
