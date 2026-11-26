import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { learnerStore } from '@vietlearning/state';
import { ChatScreen } from './ConversationScreen';
import { conv, eligibleMe, fakeClient, ids, msg } from '../test/fakeClient';
import type { SocialRest } from '../client/types';

const ok = (over: Partial<SocialRest> = {}, opts?: { state?: 'online' | 'reconnecting' }) =>
  fakeClient(
    {
      me: async () => eligibleMe as never,
      listConversations: async () => ({ conversations: [conv({ id: ids.c1, peer: { id: ids.u2, displayName: 'Minh' } })], nextCursor: null }),
      listMessages: async () => ({ messages: [], hasMore: false }),
      ...over
    },
    opts
  );
const show = (f: ReturnType<typeof fakeClient>) =>
  render(
    <MemoryRouter initialEntries={[`/tin-nhan/${ids.c1}`]}>
      <Routes>
        <Route path="/tin-nhan/:id" element={<ChatScreen client={f.client} conversationId={ids.c1} />} />
        <Route path="/tin-nhan" element={<p>DANH SÁCH</p>} />
      </Routes>
    </MemoryRouter>
  );
const texts = () => screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
afterEach(() => {
  cleanup();
  learnerStore.getState().reset();
  vi.useRealTimers();
});

describe('Cuộc trò chuyện', () => {
  it('tin sắp theo seq, tin chờ gửi nằm cuối', async () => {
    let resolve!: (v: { id: string; seq: number; createdAt: string }) => void;
    const f = ok({
      listMessages: async () => ({ messages: [msg(2), msg(1)], hasMore: false }),
      sendMessage: () => new Promise((r) => (resolve = r))
    });
    show(f);
    await screen.findByText('tin 1');
    fireEvent.change(screen.getByLabelText('Nhập tin nhắn…'), { target: { value: 'chào nha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
    const t = texts();
    expect(t[0]).toContain('tin 1');
    expect(t[1]).toContain('tin 2');
    expect(t[2]).toContain('chào nha');
    expect(screen.getByText('Đang gửi…')).toBeTruthy();
    await waitFor(() => expect(typeof resolve).toBe('function'));
    await act(async () => resolve({ id: ids.m(3), seq: 3, createdAt: '2026-11-26T09:03:00.000Z' }));
    await waitFor(() => expect(screen.queryByText('Đang gửi…')).toBeNull());
    expect(screen.getAllByText('chào nha')).toHaveLength(1); // không trùng
  });

  it('gửi lỗi ⇒ "Không gửi được" + Gửi lại; gửi lại dùng NGUYÊN clientMsgId', async () => {
    const send = vi.fn().mockRejectedValueOnce({ kind: 'offline' }).mockResolvedValue({ id: ids.m(1), seq: 1, createdAt: '2026-11-26T09:00:00.000Z' });
    show(ok({ sendMessage: send }));
    fireEvent.change(await screen.findByLabelText('Nhập tin nhắn…'), { target: { value: 'alo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Không gửi được');
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[0]![1].clientMsgId).toBe(send.mock.calls[1]![1].clientMsgId);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getAllByText('alo')).toHaveLength(1);
  });

  it('lỗi chat_rate hiện câu riêng; Bỏ tin này xóa tin chờ', async () => {
    show(ok({ sendMessage: async () => Promise.reject({ status: 429, code: 'chat_rate' }) }));
    fireEvent.change(await screen.findByLabelText('Nhập tin nhắn…'), { target: { value: 'nhanh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
    expect((await screen.findByRole('alert')).textContent).toContain('hơi nhanh');
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ tin này' }));
    expect(screen.queryByText('nhanh')).toBeNull();
  });

  it('không gửi tin trống/quá dài', async () => {
    const send = vi.fn();
    show(ok({ sendMessage: send }));
    const box = await screen.findByLabelText('Nhập tin nhắn…');
    expect((screen.getByRole('button', { name: 'Gửi' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(box, { target: { value: '   ' } });
    expect((screen.getByRole('button', { name: 'Gửi' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(box, { target: { value: 'a'.repeat(4001) } });
    expect(screen.getByRole('alert').textContent).toContain('4000');
    expect((screen.getByRole('button', { name: 'Gửi' }) as HTMLButtonElement).disabled).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it('khung WS: đúng seq+1 thì nhận, trùng thì bỏ, nhảy cách thì bù bằng afterSeq đúng một lần', async () => {
    const list = vi.fn(async (_c: string, q?: { afterSeq?: number }) =>
      q?.afterSeq === 2 ? { messages: [msg(3), msg(4), msg(5)], hasMore: false } : { messages: [msg(1), msg(2)], hasMore: false }
    );
    const f = ok({ listMessages: list });
    show(f);
    await screen.findByText('tin 2');
    act(() => f.push({ t: 'msg', message: msg(2) })); // trùng
    expect(texts().filter((x) => x.includes('tin 2'))).toHaveLength(1);
    act(() => f.push({ t: 'msg', message: msg(5) })); // nhảy từ 2 lên 5
    await screen.findByText('tin 4');
    expect(list.mock.calls.filter((c) => c[1]?.afterSeq === 2)).toHaveLength(1);
    expect(texts().map((x) => x.match(/tin (\d)/)?.[1])).toEqual(['1', '2', '3', '4', '5']);
  });

  it('nối lại WebSocket ⇒ bù tin bị lỡ; thanh "Đang kết nối…" khi đang nối lại', async () => {
    const list = vi.fn(async (_c: string, q?: { afterSeq?: number }) => (q?.afterSeq ? { messages: [msg(2)], hasMore: false } : { messages: [msg(1)], hasMore: false }));
    const f = ok({ listMessages: list }, { state: 'reconnecting' });
    show(f);
    await screen.findByText('tin 1');
    expect(screen.getByText('Đang kết nối…')).toBeTruthy();
    act(() => f.setState('online'));
    await screen.findByText('tin 2');
    expect(screen.queryByText('Đang kết nối…')).toBeNull();
  });

  it('thu hồi tin của mình ⇒ hiện "đã thu hồi" + Hoàn tác; hoàn tác gọi restore', async () => {
    const recall = vi.fn(async () => undefined);
    const restore = vi.fn(async () => undefined);
    show(ok({ listMessages: async () => ({ messages: [msg(1, { mine: true, sender: undefined })], hasMore: false }), recall, restore }));
    fireEvent.click(await screen.findByRole('button', { name: 'Thu hồi' }));
    await screen.findByText('Bạn đã thu hồi một tin nhắn');
    expect(recall).toHaveBeenCalledWith(ids.m(1));
    fireEvent.click(screen.getByRole('button', { name: 'Hoàn tác' }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith(ids.m(1)));
  });

  it('người khác thu hồi (khung recall) ⇒ nội dung biến mất, chỉ còn "Tin đã thu hồi"', async () => {
    const f = ok({ listMessages: async () => ({ messages: [msg(1)], hasMore: false }) });
    show(f);
    await screen.findByText('tin 1');
    act(() => f.push({ t: 'recall', cid: ids.c1, messageId: ids.m(1), seq: 1 }));
    expect(await screen.findByText('Tin đã thu hồi')).toBeTruthy();
    expect(screen.queryByText('tin 1')).toBeNull();
  });

  it('tin của người đã chặn ⇒ "Tin của người bạn đã chặn", không có nội dung', async () => {
    show(ok({ listMessages: async () => ({ messages: [msg(1, { blocked: true, body: undefined, sender: undefined })], hasMore: false }) }));
    expect(await screen.findByText('Tin của người bạn đã chặn')).toBeTruthy();
  });

  it('tin mới chen vào khi đang đọc phía trên ⇒ không giật màn, hiện nút "Có tin mới ↓"', async () => {
    const f = ok({ listMessages: async () => ({ messages: [msg(1), msg(2)], hasMore: false }) });
    show(f);
    await screen.findByText('tin 2');
    const box = screen.getByLabelText('Danh sách tin nhắn').parentElement!;
    Object.defineProperty(box, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(box, 'clientHeight', { configurable: true, value: 300 });
    box.scrollTop = 0; // người đọc đang ở trên
    fireEvent.scroll(box);
    act(() => f.push({ t: 'msg', message: msg(3) }));
    const pill = await screen.findByRole('button', { name: 'Có tin mới ↓' });
    expect(box.scrollTop).toBe(0);
    fireEvent.click(pill);
    expect(box.scrollTop).toBe(1000);
    expect(screen.queryByRole('button', { name: 'Có tin mới ↓' })).toBeNull();
  });

  it('đang ở đáy ⇒ tin mới cuộn theo, không hiện nút', async () => {
    const f = ok({ listMessages: async () => ({ messages: [msg(1)], hasMore: false }) });
    show(f);
    await screen.findByText('tin 1');
    act(() => f.push({ t: 'msg', message: msg(2) }));
    await screen.findByText('tin 2');
    expect(screen.queryByRole('button', { name: 'Có tin mới ↓' })).toBeNull();
  });

  it('rỗng ⇒ lời chào; lỗi tải ⇒ Thử lại; đã xem gửi seq mới nhất', async () => {
    const mark = vi.fn(async () => undefined);
    show(ok({ markRead: mark, listMessages: async () => ({ messages: [msg(1), msg(2)], hasMore: false }) }));
    await screen.findByText('tin 2');
    await waitFor(() => expect(mark).toHaveBeenCalledWith(ids.c1, 2));
    cleanup();
    show(ok());
    expect(await screen.findByText('Hãy gửi lời chào đầu tiên!')).toBeTruthy();
    cleanup();
    const list = vi.fn().mockRejectedValueOnce({ kind: 'offline' }).mockResolvedValue({ messages: [], hasMore: false });
    show(ok({ listMessages: list }));
    fireEvent.click(await screen.findByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Hãy gửi lời chào đầu tiên!')).toBeTruthy();
  });

  it('chặn người này: hỏi xác nhận rồi gọi blockUser và về danh sách', async () => {
    const block = vi.fn(async () => undefined);
    show(ok({ blockUser: block }));
    fireEvent.click(await screen.findByRole('button', { name: 'Chặn hoặc báo cáo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chặn người này' }));
    expect(screen.getByText(/Chặn Minh\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Có, chặn' }));
    await waitFor(() => expect(block).toHaveBeenCalledWith(ids.u2));
    expect(await screen.findByText('DANH SÁCH')).toBeTruthy();
  });

  it('báo cáo: phải chọn lý do; gửi đúng thân và chỉ báo "đã gửi"', async () => {
    const report = vi.fn(async () => ({ id: ids.m(9) }));
    show(ok({ report }));
    fireEvent.click(await screen.findByRole('button', { name: 'Chặn hoặc báo cáo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Báo cáo' }));
    const dlg = screen.getByRole('dialog');
    const send = within(dlg).getByRole('button', { name: 'Gửi báo cáo' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(within(dlg).getByLabelText('Lừa đảo'));
    fireEvent.click(send);
    await waitFor(() => expect(report).toHaveBeenCalledWith({ conversationId: ids.c1, reportedUserId: ids.u2, reason: 'scam' }));
    expect(await screen.findByText(/Cảm ơn bạn/)).toBeTruthy();
  });
});
