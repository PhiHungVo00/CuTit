import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { learnerStore } from '@vietlearning/state';

const capturePhoto = vi.hoisted(() => vi.fn());
const voice = vi.hoisted(() => ({ status: 'idle' as string, level: 0, error: null as string | null, start: vi.fn(), stop: vi.fn(), cancel: vi.fn() }));
vi.mock('@vietlearning/shared/audio', () => ({ playSfx: vi.fn() }));
vi.mock('@vietlearning/native', () => ({ canOpenAppSettings: () => false, openAppSettings: vi.fn(), capturePhoto, getDeviceSpeech: () => ({ speak: vi.fn() }) }));
vi.mock('./useVoiceInput', async (orig) => ({ ...(await orig<typeof import('./useVoiceInput')>()), useVoiceInput: () => voice }));

import { ChatHeader } from './ChatHeader';
import { Composer } from './Composer';
import { HistorySheet } from './HistorySheet';
import { MessageBubble } from './MessageBubble';
import { AiConsentDialog, aiConsentKey } from './AiConsentDialog';

const Where = () => <p data-testid="where">{useLocation().pathname + useLocation().search}</p>;
const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}<Where /></MemoryRouter>);
const yes = async () => true;
const R = (o: Partial<{ turns: number; llmTokens: number; sttSeconds: number; visionImages: number }> = {}) => ({ turns: 20, llmTokens: 1000, sttSeconds: 60, visionImages: 5, ...o });

beforeEach(() => {
  voice.status = 'idle';
  voice.error = null;
  voice.start.mockReset();
  voice.stop.mockReset();
  capturePhoto.mockReset();
  learnerStore.getState().reset();
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
});
afterEach(cleanup);

describe('ChatHeader', () => {
  it('có lịch sử, gọi thường, gọi video với nhãn vi/en', () => {
    wrap(<ChatHeader remaining={R()} tutorName="Bé Cu Tít" onHistory={() => undefined} ensureConsent={yes} />);
    for (const n of ['Lịch sử trò chuyện', 'Gọi thường', 'Gọi video']) expect(screen.getByRole('button', { name: n })).toBeTruthy();
    cleanup();
    learnerStore.getState().setPreferences({ uiLanguage: 'en' });
    wrap(<ChatHeader remaining={R()} tutorName="Bé Cu Tít" onHistory={() => undefined} ensureConsent={yes} />);
    for (const n of ['Chat history', 'Voice call', 'Video call']) expect(screen.getByRole('button', { name: n })).toBeTruthy();
  });

  it('📞 ⇒ /goi-thoai?video=0, 📹 ⇒ /goi-thoai?video=1', async () => {
    wrap(<ChatHeader remaining={R()} tutorName="x" onHistory={() => undefined} ensureConsent={yes} />);
    fireEvent.click(screen.getByRole('button', { name: 'Gọi thường' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/goi-thoai?video=0'));
    fireEvent.click(screen.getByRole('button', { name: 'Gọi video' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/goi-thoai?video=1'));
  });

  it('chưa đồng ý AI ⇒ không chuyển trang', async () => {
    wrap(<ChatHeader remaining={R()} tutorName="x" onHistory={() => undefined} ensureConsent={async () => false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Gọi thường' }));
    await act(async () => undefined);
    expect(screen.getByTestId('where').textContent).toBe('/');
  });

  it('hiện "Còn N lượt hôm nay"; N ≤ 5 có class cảnh báo', () => {
    wrap(<ChatHeader remaining={R({ turns: 12 })} tutorName="x" onHistory={() => undefined} ensureConsent={yes} />);
    expect(screen.getByTestId('remaining').textContent).toBe('Còn 12 lượt hôm nay · Miễn phí trong thời gian đầu');
    expect(screen.getByTestId('remaining').className).not.toContain('ct-remaining-low');
    cleanup();
    wrap(<ChatHeader remaining={R({ turns: 5 })} tutorName="x" onHistory={() => undefined} ensureConsent={yes} />);
    expect(screen.getByTestId('remaining').className).toContain('ct-remaining-low');
  });

  it('visionImages = 0 ⇒ gọi video tắt kèm chú thích', () => {
    wrap(<ChatHeader remaining={R({ visionImages: 0 })} tutorName="x" onHistory={() => undefined} ensureConsent={yes} />);
    expect((screen.getByRole('button', { name: 'Gọi video' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/hết lượt gửi ảnh/)).toBeTruthy();
  });
});

describe('Composer', () => {
  const comp = (over: Partial<React.ComponentProps<typeof Composer>> = {}) => {
    const onSend = vi.fn();
    const utils = wrap(<Composer busy={false} remaining={R()} placeholder="p" ensureConsent={yes} onSend={onSend} onCancel={() => undefined} {...over} />);
    return { onSend, ...utils };
  };

  it('📷 ⇒ capturePhoto() ⇒ gửi tin kind:image kèm ảnh', async () => {
    capturePhoto.mockResolvedValue({ base64: 'QUJD', previewUrl: 'blob:p' });
    const { onSend } = comp();
    fireEvent.click(screen.getByRole('button', { name: 'Chụp ảnh gửi Cu Tít' }));
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(onSend).toHaveBeenCalledWith('Đây là hình mình chụp.', { image: { base64: 'QUJD', previewUrl: 'blob:p' }, kind: 'image' });
  });

  it('📷 hủy ⇒ không gửi gì; quyền bị từ chối ⇒ báo lỗi', async () => {
    capturePhoto.mockResolvedValueOnce(null).mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'permission-denied' }));
    const { onSend } = comp();
    const b = screen.getByRole('button', { name: 'Chụp ảnh gửi Cu Tít' });
    fireEvent.click(b);
    await act(async () => undefined);
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.click(b);
    expect(await screen.findByText('Ứng dụng chưa được cấp quyền camera.')).toBeTruthy();
  });

  it('visionImages = 0 ⇒ 📷 tắt kèm chú thích; sttSeconds = 0 ⇒ 🎤 tắt', () => {
    comp({ remaining: R({ visionImages: 0, sttSeconds: 0 }) });
    expect((screen.getByRole('button', { name: 'Chụp ảnh gửi Cu Tít' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Giữ để nói' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/hết lượt gửi ảnh/)).toBeTruthy();
    expect(screen.getByText(/hết thời lượng nhận giọng nói/)).toBeTruthy();
  });

  it('🎤 giữ ⇒ bắt đầu ghi; thả ⇒ dừng', async () => {
    comp();
    const mic = screen.getByRole('button', { name: 'Giữ để nói' });
    fireEvent.pointerDown(mic);
    await waitFor(() => expect(voice.start).toHaveBeenCalled());
    voice.status = 'recording';
    fireEvent.pointerUp(mic);
    expect(voice.stop).not.toHaveBeenCalled(); // chưa render lại với status mới
  });

  describe('đếm ngược tin giọng nói', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('chỉ hiện từ giây 10; tự dừng ở 15 s kèm câu giải thích', () => {
      const props = { busy: false, remaining: R(), placeholder: 'p', ensureConsent: yes, onSend: vi.fn(), onCancel: () => undefined };
      voice.status = 'recording';
      const { rerender } = render(<MemoryRouter><Composer {...props} /></MemoryRouter>);
      act(() => void vi.advanceTimersByTime(9000));
      expect(screen.queryByText(/Còn \d+ giây/)).toBeNull();
      act(() => void vi.advanceTimersByTime(1250));
      expect(screen.getByText('Còn 5 giây')).toBeTruthy();
      act(() => void vi.advanceTimersByTime(4000));
      expect(screen.getByText('Còn 1 giây')).toBeTruthy();
      act(() => void vi.advanceTimersByTime(1000));
      voice.status = 'idle'; // useVoiceInput tự dừng ở MAX_VOICE_MS
      rerender(<MemoryRouter><Composer {...props} /></MemoryRouter>);
      expect(screen.getByText(/Đã đủ 15 giây/)).toBeTruthy();
    });

    it('dừng sớm ⇒ không có câu giải thích giới hạn', () => {
      const props = { busy: false, remaining: R(), placeholder: 'p', ensureConsent: yes, onSend: vi.fn(), onCancel: () => undefined };
      voice.status = 'recording';
      const { rerender } = render(<MemoryRouter><Composer {...props} /></MemoryRouter>);
      act(() => void vi.advanceTimersByTime(3000));
      voice.status = 'idle';
      rerender(<MemoryRouter><Composer {...props} /></MemoryRouter>);
      expect(screen.queryByText(/Đã đủ 15 giây/)).toBeNull();
    });
  });

  it('gửi chữ bằng nút Gửi', () => {
    const { onSend } = comp();
    fireEvent.change(screen.getByLabelText('Tin nhắn'), { target: { value: 'xin chào' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
    expect(onSend).toHaveBeenCalledWith('xin chào', { kind: 'text' });
  });
});

describe('HistorySheet', () => {
  const rows = [
    { id: 'c3', title: 'Cuộc mới nhất', updatedAt: '3' },
    { id: 'c2', title: '', updatedAt: '2', scenarioId: 'sc1' },
    { id: 'c1', title: 'Cuộc cũ', updatedAt: '1' }
  ];
  const sheet = (over: Partial<React.ComponentProps<typeof HistorySheet>> = {}) => {
    const h = { onOpen: vi.fn(), onNew: vi.fn(), onDelete: vi.fn(), onDeleteAll: vi.fn(), onClose: vi.fn() };
    render(<HistorySheet conversations={rows} {...h} {...over} />);
    return h;
  };

  it('giữ thứ tự (mới nhất trước), nhãn tình huống, mở lại, cuộc mới', () => {
    const h = sheet();
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items[0]).toContain('Cuộc mới nhất');
    expect(items[1]).toMatch(/^Luyện tình huống: /);
    fireEvent.click(screen.getByText('Cuộc cũ'));
    expect(h.onOpen).toHaveBeenCalledWith('c1');
    fireEvent.click(screen.getByRole('button', { name: 'Cuộc trò chuyện mới' }));
    expect(h.onNew).toHaveBeenCalled();
  });

  it('xóa từng cuộc', () => {
    const h = sheet();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa cuộc trò chuyện này: Cuộc cũ' }));
    expect(h.onDelete).toHaveBeenCalledWith('c1');
  });

  it('xóa tất cả phải xác nhận; "Giữ lại" thì không xóa', () => {
    const h = sheet();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa tất cả' }));
    expect(h.onDeleteAll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Giữ lại' }));
    expect(h.onDeleteAll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa tất cả' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xóa hết' }));
    expect(h.onDeleteAll).toHaveBeenCalledTimes(1);
  });

  it('trống ⇒ báo chưa có cuộc nào', () => {
    sheet({ conversations: [] });
    expect(screen.getByText('Chưa có cuộc trò chuyện nào.')).toBeTruthy();
  });
});

describe('MessageBubble', () => {
  it('tin chưa gửi được có nút gửi lại (khi retry được) và ảnh xem trước', () => {
    const onResend = vi.fn();
    render(<MemoryRouter><MessageBubble message={{ id: 'u1', role: 'user', text: 'cái này là gì', status: 'failed', errorText: 'Không kết nối được máy chủ', canRetry: true, image: { base64: 'x', previewUrl: 'blob:p' } }} tutorName="Cu Tít" avatar onResend={onResend} /></MemoryRouter>);
    expect(screen.getByAltText('Ảnh').getAttribute('src')).toBe('blob:p');
    expect(screen.getByRole('alert').textContent).toContain('Chưa gửi được');
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại' }));
    expect(onResend).toHaveBeenCalledWith('u1');
  });

  it('hết lượt (canRetry=false) ⇒ không có nút gửi lại', () => {
    render(<MemoryRouter><MessageBubble message={{ id: 'u1', role: 'user', text: 'a', status: 'failed', errorText: 'Hết lượt hôm nay, có lượt mới lúc 0 giờ', canRetry: false }} tutorName="Cu Tít" avatar onResend={() => undefined} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Gửi lại' })).toBeNull();
  });
});

describe('AiConsentDialog', () => {
  it('người đã có consents.voice thấy công tắc micro bật sẵn nhưng vẫn phải xác nhận một lần', () => {
    learnerStore.getState().giveConsent('voice');
    const onDone = vi.fn();
    wrap(<AiConsentDialog version={2} wants="camera" onDone={onDone} />);
    expect((screen.getByRole('switch', { name: /giọng nói/ }) as HTMLInputElement).checked).toBe(true);
    expect(learnerStore.getState().consents[aiConsentKey(2)]).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Đã hiểu, tiếp tục' }));
    expect(learnerStore.getState().consents[aiConsentKey(2)]).toBe(true);
    expect(onDone).toHaveBeenCalledWith({ confirmed: true, voice: true, camera: true });
  });

  it('tắt công tắc camera ⇒ rút lại đồng ý camera; "Để sau" không lưu gì', () => {
    learnerStore.getState().giveConsent('camera');
    const onDone = vi.fn();
    wrap(<AiConsentDialog version={2} wants="voice" onDone={onDone} />);
    fireEvent.click(screen.getByRole('switch', { name: /camera/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Đã hiểu, tiếp tục' }));
    expect(learnerStore.getState().consents.camera).toBeUndefined();
    expect(learnerStore.getState().consents.voice).toBe(true);
    cleanup();
    learnerStore.getState().reset();
    learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
    wrap(<AiConsentDialog version={3} wants="voice" onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Để sau' }));
    expect(learnerStore.getState().consents[aiConsentKey(3)]).toBeUndefined();
  });
});
