import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { learnerStore } from '@vietlearning/state';

const sendTurn = vi.hoisted(() => vi.fn());
const summarizeConversation = vi.hoisted(() => vi.fn());
vi.mock('./chatClient', async (orig) => ({ ...(await orig<typeof import('./chatClient')>()), sendTurn, summarizeConversation }));

import { useChatSession, type ChatMessage } from './useChatSession';
import { TurnError } from './chatClient';

const ok = (reply = 'Chào bạn!', extra: object = {}) => ({ reply, completedTasks: [], newWords: [], mock: false, ...extra });
const store = () => ({ appendMessage: vi.fn(async () => undefined), setSummary: vi.fn(async () => undefined) });
const old = (n: number): ChatMessage[] => Array.from({ length: n }, (_, i) => ({ id: `o${i}`, role: i % 2 ? ('tutor' as const) : ('user' as const), text: `tin ${i}`, status: 'sent' as const }));

beforeEach(() => learnerStore.getState().setPreferences({ uiLanguage: 'vi' }));
afterEach(() => {
  sendTurn.mockReset();
  summarizeConversation.mockReset();
});

describe('yêu cầu gửi đi', () => {
  it('mở lại cuộc 120 tin ⇒ chỉ gửi 10 lượt history + summary hiện có', async () => {
    sendTurn.mockResolvedValue(ok());
    const { result } = renderHook(() => useChatSession({ initialMessages: old(120), initialSummary: 'Bạn đã chào Cu Tít.', store: store() }));
    await act(async () => result.current.send('xin chào'));
    const req = sendTurn.mock.calls[0][0];
    expect(req.history).toHaveLength(10);
    expect(req.history[9].text).toBe('tin 119');
    expect(req.summary).toBe('Bạn đã chào Cu Tít.');
  });

  it('lượt có ảnh gửi imageBase64 và lưu tin kind:image', async () => {
    sendTurn.mockResolvedValue(ok());
    const st = store();
    const { result } = renderHook(() => useChatSession({ store: st }));
    await act(async () => result.current.send('Đây là gì?', { image: { base64: 'QUJD', previewUrl: 'blob:x' } }));
    expect(sendTurn.mock.calls[0][0].imageBase64).toBe('QUJD');
    expect(st.appendMessage).toHaveBeenCalledWith(expect.objectContaining({ role: 'user', kind: 'image', text: 'Đây là gì?' }));
  });

  it('báo remaining và mock từ Gateway', async () => {
    sendTurn.mockResolvedValue(ok('mẫu', { mock: true, remaining: { turns: 4, llmTokens: 1, sttSeconds: 0, visionImages: 2 } }));
    const { result } = renderHook(() => useChatSession());
    await act(async () => result.current.send('a'));
    expect(result.current.remaining?.turns).toBe(4);
    expect(result.current.isMock).toBe(true);
  });
});

describe('tóm tắt sau mỗi 10 lượt người dùng', () => {
  it('đủ 10 lượt ⇒ gọi summarizeConversation đúng một lần, lưu setSummary, lượt sau dùng tóm tắt mới', async () => {
    sendTurn.mockResolvedValue(ok());
    summarizeConversation.mockResolvedValue('Tóm tắt mới');
    const st = store();
    const { result } = renderHook(() => useChatSession({ store: st, initialTurnsSinceSummary: 9, initialMessages: old(4) }));
    await act(async () => result.current.send('lượt thứ mười'));
    await waitFor(() => expect(st.setSummary).toHaveBeenCalledWith('Tóm tắt mới'));
    expect(summarizeConversation).toHaveBeenCalledTimes(1);
    expect(summarizeConversation.mock.calls[0][0].history.length).toBeLessThanOrEqual(20);
    sendTurn.mockClear();
    await act(async () => result.current.send('lượt kế'));
    expect(sendTurn.mock.calls[0][0].summary).toBe('Tóm tắt mới');
    expect(summarizeConversation).toHaveBeenCalledTimes(1);
  });

  it('summarizeConversation lỗi ⇒ không chặn, giữ tóm tắt cũ, thử lại ở lượt sau', async () => {
    sendTurn.mockResolvedValue(ok());
    summarizeConversation.mockRejectedValueOnce(new TurnError('unavailable', 'bận', 'llm_busy')).mockResolvedValueOnce('Tóm tắt sau');
    const st = store();
    const { result } = renderHook(() => useChatSession({ store: st, initialTurnsSinceSummary: 9, initialSummary: 'Cũ' }));
    await act(async () => result.current.send('lượt mười'));
    await waitFor(() => expect(summarizeConversation).toHaveBeenCalledTimes(1));
    expect(result.current.error).toBeNull();
    expect(st.setSummary).not.toHaveBeenCalled();
    sendTurn.mockClear();
    await act(async () => result.current.send('lượt mười một'));
    expect(sendTurn.mock.calls[0][0].summary).toBe('Cũ');
    await waitFor(() => expect(st.setSummary).toHaveBeenCalledWith('Tóm tắt sau'));
  });
});

describe('lỗi và gửi lại', () => {
  it('mất mạng giữa lượt có ảnh ⇒ tin failed + errorText, ảnh còn trong RAM, gửi lại được và không trùng tin', async () => {
    sendTurn.mockRejectedValueOnce(new TurnError('offline', 'x')).mockResolvedValueOnce(ok('Đẹp quá!'));
    const { result } = renderHook(() => useChatSession());
    await act(async () => result.current.send('Cái này là gì?', { image: { base64: 'QUJD', previewUrl: 'blob:x' } }));
    const failed = result.current.messages.find((m) => m.role === 'user')!;
    expect(failed.status).toBe('failed');
    expect(failed.errorText).toBe('Không kết nối được máy chủ');
    expect(failed.canRetry).toBe(true);
    expect(failed.image?.base64).toBe('QUJD');
    await act(async () => result.current.resend(failed.id));
    expect(sendTurn.mock.calls[1][0].imageBase64).toBe('QUJD');
    const users = result.current.messages.filter((m) => m.role === 'user');
    expect(users).toHaveLength(1);
    expect(users[0].status).toBe('sent');
    expect(result.current.messages.at(-1)?.text).toBe('Đẹp quá!');
  });

  it('llm_busy ⇒ câu bận + retry', async () => {
    sendTurn.mockRejectedValue(new TurnError('unavailable', 'x', 'llm_busy'));
    const { result } = renderHook(() => useChatSession());
    await act(async () => result.current.send('a'));
    expect(result.current.messages[0].errorText).toBe('Cu Tít đang bận, thử lại sau ít giây');
    expect(result.current.messages[0].canRetry).toBe(true);
  });

  it('quota_exceeded ⇒ không retry; global ⇒ câu riêng', async () => {
    sendTurn.mockRejectedValueOnce(new TurnError('quota', 'x', 'quota_exceeded')).mockRejectedValueOnce(new TurnError('quota', 'x', 'quota_exceeded', { scope: 'global' }));
    const { result } = renderHook(() => useChatSession());
    await act(async () => result.current.send('a'));
    expect(result.current.messages[0].errorText).toBe('Hết lượt hôm nay, có lượt mới lúc 0 giờ');
    expect(result.current.messages[0].canRetry).toBe(false);
    await act(async () => result.current.send('b'));
    expect(result.current.messages.find((m) => m.text === 'b')?.errorText).toBe('Hôm nay nhiều bạn học quá, Cu Tít nghỉ một chút');
  });

  it('tin failed không nằm trong history lượt sau và không được lưu', async () => {
    sendTurn.mockRejectedValueOnce(new TurnError('offline', 'x')).mockResolvedValueOnce(ok());
    const st = store();
    const { result } = renderHook(() => useChatSession({ store: st }));
    await act(async () => result.current.send('hỏng'));
    expect(st.appendMessage).not.toHaveBeenCalled();
    await act(async () => result.current.send('được'));
    expect(sendTurn.mock.calls[1][0].history).toEqual([]);
  });
});
