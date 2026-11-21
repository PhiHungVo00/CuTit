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

describe('ChatPanel báo lỗi bằng Cu Tít buồn (P0-4)', () => {
  const withError = (error: string, errorCode: string | null) =>
    render(<ChatPanel session={{ ...session, error, errorCode } as never} placeholder="p" emptyHint="e" tutorName="Bé Cu Tít" />);

  it('hết lượt hôm nay (quota_exceeded): Cu Tít buồn + câu giờ đặt lại, KHÔNG có nút Thử lại', () => {
    const { container } = withError('Hôm nay bạn đã dùng hết lượt nói chuyện với AI. Lượt mới bắt đầu lúc 00:00.', 'quota_exceeded');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Lượt mới bắt đầu lúc 00:00');
    expect(container.querySelector('img[src*="cutit-buon"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('mất mạng (offline): Cu Tít buồn và vẫn có nút Thử lại', () => {
    const { container } = withError('Mất kết nối giữa chừng. Vui lòng thử lại.', 'offline');
    expect(container.querySelector('img[src*="cutit-buon"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(session.retry).toHaveBeenCalled();
  });

  it('bản en: nút "Try again" cho lỗi tạm thời', () => {
    learnerStore.getState().setPreferences({ uiLanguage: 'en' });
    withError('Connection lost.', 'timeout');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('không lỗi thì không có Cu Tít buồn', () => {
    const { container } = show();
    expect(container.querySelector('img[src*="cutit-buon"]')).toBeNull();
  });
});
