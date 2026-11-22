import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { learnerStore } from '@vietlearning/state';

const sendTurn = vi.hoisted(() => vi.fn());
const hist = vi.hoisted(() => ({
  AI_PROVIDERS_VERSION: 2,
  listConversations: vi.fn(),
  recentMessages: vi.fn(),
  createConversation: vi.fn(),
  appendMessage: vi.fn(),
  setSummary: vi.fn(),
  deleteConversation: vi.fn(),
  deleteAll: vi.fn()
}));
vi.mock('@vietlearning/shared/audio', () => ({ playSfx: vi.fn() }));
vi.mock('@vietlearning/native', () => ({ canOpenAppSettings: () => false, openAppSettings: vi.fn(), capturePhoto: vi.fn(), getDeviceSpeech: () => ({ speak: vi.fn() }) }));
vi.mock('@vietlearning/state/chat-history', () => hist);
vi.mock('./chatClient', async (orig) => ({ ...(await orig<typeof import('./chatClient')>()), sendTurn, summarizeConversation: vi.fn() }));

import { ChatScreen } from './ChatScreen';

const show = (url = '/hoi-thoai') => render(<MemoryRouter initialEntries={[url]}><ChatScreen /></MemoryRouter>);

beforeEach(() => {
  sendTurn.mockReset();
  Object.values(hist).forEach((f) => typeof f === 'function' && f.mockReset());
  hist.listConversations.mockResolvedValue([]);
  hist.recentMessages.mockResolvedValue([]);
  hist.createConversation.mockResolvedValue({ id: 'cNEW' });
  hist.appendMessage.mockResolvedValue({});
  learnerStore.getState().reset();
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
});
afterEach(cleanup);

describe('ChatScreen', () => {
  it('?tinh-huong=sc5 ⇒ cuộc mới gắn tình huống, lượt gửi đi mang scenarioId; cuộc chỉ tạo ở tin đầu tiên', async () => {
    sendTurn.mockResolvedValue({ reply: 'Chào bạn!', completedTasks: [], newWords: [], mock: false, remaining: { turns: 4, llmTokens: 1, sttSeconds: 1, visionImages: 1 } });
    show('/hoi-thoai?tinh-huong=sc5');
    const input = await screen.findByLabelText('Tin nhắn');
    expect(hist.createConversation).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'xin chào' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
    await waitFor(() => expect(hist.appendMessage).toHaveBeenCalledTimes(2));
    expect(sendTurn.mock.calls[0][0].scenarioId).toBe('sc5');
    expect(hist.createConversation).toHaveBeenCalledWith({ scenarioId: 'sc5' });
    expect(screen.getByTestId('remaining').className).toContain('ct-remaining-low');
  });

  it('?cuoc=<id> ⇒ mở lại tin cũ và gửi kèm tóm tắt cũ', async () => {
    hist.listConversations.mockResolvedValue([{ id: 'c1', title: 't', updatedAt: '1', summary: 'Đã chào nhau.', userTurnsSinceSummary: 2, createdAt: '0' }]);
    hist.recentMessages.mockResolvedValue([
      { id: 'm1', conversationId: 'c1', role: 'user', kind: 'text', text: 'Chào Cu Tít', at: '1', status: 'sent' },
      { id: 'm2', conversationId: 'c1', role: 'tutor', kind: 'text', text: 'Chào bạn nhỏ', at: '2', status: 'sent' }
    ]);
    sendTurn.mockResolvedValue({ reply: 'ok', completedTasks: [], newWords: [], mock: false });
    show('/hoi-thoai?cuoc=c1');
    expect(await screen.findByText('Chào Cu Tít')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Tin nhắn'), { target: { value: 'tiếp nhé' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
    await waitFor(() => expect(sendTurn).toHaveBeenCalled());
    expect(sendTurn.mock.calls[0][0].summary).toBe('Đã chào nhau.');
    expect(sendTurn.mock.calls[0][0].history.map((h: { text: string }) => h.text)).toEqual(['Chào Cu Tít', 'Chào bạn nhỏ']);
    expect(hist.createConversation).not.toHaveBeenCalled();
  });

  it('chế độ giả lập (mock:true) ⇒ dải cố định trên đầu chat', async () => {
    sendTurn.mockResolvedValue({ reply: 'câu mẫu', completedTasks: [], newWords: [], mock: true });
    show();
    fireEvent.change(await screen.findByLabelText('Tin nhắn'), { target: { value: 'a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
    expect((await screen.findByTestId('mock-banner')).textContent).toContain('giả lập');
  });

  it('mở lịch sử ⇒ liệt kê cuộc; chưa đồng ý AI ⇒ gọi video hiện hộp đồng ý', async () => {
    hist.listConversations.mockResolvedValue([{ id: 'c1', title: 'Cuộc A', updatedAt: '1', userTurnsSinceSummary: 0, createdAt: '0' }]);
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Lịch sử trò chuyện' }));
    expect(await screen.findByText('Cuộc A')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gọi video' }));
    expect(await screen.findByRole('dialog', { name: 'Cu Tít dùng dịch vụ AI nào?' })).toBeTruthy();
  });
});
