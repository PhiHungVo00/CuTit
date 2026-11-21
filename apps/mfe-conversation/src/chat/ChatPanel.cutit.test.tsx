import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { learnerStore } from '@vietlearning/state';

const order = vi.hoisted(() => [] as string[]);
const voice = vi.hoisted(() => ({ status: 'idle' as string, level: 0, error: null, start: vi.fn(), stop: vi.fn(), cancel: vi.fn() }));
vi.mock('@vietlearning/shared/audio', () => ({ playSfx: (n: string) => order.push(`sfx:${n}`) }));
vi.mock('@vietlearning/native', () => ({
  canOpenAppSettings: () => false,
  openAppSettings: vi.fn(),
  getDeviceSpeech: () => ({ speak: vi.fn(async (t: string) => void order.push(`tts:${t}`)) })
}));
vi.mock('./useVoiceInput', () => ({ useVoiceInput: () => voice }));

import { ChatPanel } from './ChatPanel';

const session = {
  messages: [
    { id: '1', role: 'user' as const, text: 'xin chào' },
    { id: '2', role: 'tutor' as const, text: 'Chào bạn!' }
  ],
  busy: false,
  turnState: 'IDLE' as const,
  error: null,
  errorCode: null,
  send: vi.fn(),
  retry: vi.fn(),
  cancel: vi.fn()
};
const show = () => render(<ChatPanel session={session as never} placeholder="p" emptyHint="e" tutorName="Bé Cu Tít" />);

beforeEach(() => {
  order.length = 0;
  voice.status = 'idle';
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  learnerStore.getState().reset();
});

describe('ChatPanel dùng Cu Tít + âm hiệu ứng', () => {
  it('avatar tin nhắn của Cu Tít là chân dung', () => {
    show();
    const imgs = screen.getAllByRole('img') as HTMLImageElement[];
    expect(imgs.some((i) => i.src.includes('cutit-chan-dung'))).toBe(true);
  });

  it('đang nghe micro ⇒ avatar chuyển sang mood "nghe"', () => {
    voice.status = 'recording';
    show();
    const imgs = screen.getAllByRole('img') as HTMLImageElement[];
    expect(imgs.some((i) => i.src.includes('cutit-nghe'))).toBe(true);
    expect(imgs.some((i) => i.src.includes('cutit-chan-dung'))).toBe(false);
  });

  it('bấm Nghe ⇒ phát cutit-noi TRƯỚC khi đọc', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Nghe' }));
    expect(order).toEqual(['sfx:cutit-noi', 'tts:Chào bạn!']);
  });
});
