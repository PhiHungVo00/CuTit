import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { learnerStore } from '@vietlearning/state';
import { ChatListScreen } from './ConversationList';
import { CHAT_UNREAD_EVENT } from '../state/useSocial';
import { conv, eligibleMe, fakeClient, ids } from '../test/fakeClient';
import { msg } from '../test/fakeClient';

const show = (f: ReturnType<typeof fakeClient>) =>
  render(
    <MemoryRouter>
      <ChatListScreen client={f.client} />
    </MemoryRouter>
  );
afterEach(() => {
  cleanup();
  learnerStore.getState().reset();
});

const old = { seq: 3, kind: 'text' as const, preview: 'Chiều nay học nhóm không?', createdAt: '2026-11-25T08:00:00.000Z' };
const recent = { seq: 9, kind: 'text' as const, preview: 'Mai học bài nào chưa?', createdAt: '2026-11-26T10:24:00.000Z' };

describe('Danh sách cuộc trò chuyện', () => {
  it('sắp theo tin mới nhất, có chấm số chưa đọc (chữ cho trình đọc màn hình) và phát số tổng cho Host', async () => {
    const events: number[] = [];
    window.addEventListener(CHAT_UNREAD_EVENT, (e) => events.push((e as CustomEvent<number>).detail));
    const f = fakeClient({
      me: async () => eligibleMe as never,
      listConversations: async () => ({
        nextCursor: null,
        conversations: [conv({ id: ids.c1, peer: { id: ids.u1, displayName: 'Minh' }, lastMessage: old, lastSeq: 3, unread: 0 }), conv({ id: ids.c2, peer: { id: ids.u2, displayName: 'Lan' }, lastMessage: recent, lastSeq: 9, unread: 3 })]
      })
    });
    show(f);
    const items = await screen.findAllByRole('listitem');
    expect(items[0]!.textContent).toContain('Lan');
    expect(items[1]!.textContent).toContain('Minh');
    expect(screen.getByText('3 tin chưa đọc', { selector: '.sr-only' })).toBeTruthy();
    await waitFor(() => expect(events.at(-1)).toBe(3));
  });

  it('tin mới qua WebSocket đẩy cuộc trò chuyện lên đầu và tăng số chưa đọc', async () => {
    const f = fakeClient({
      me: async () => eligibleMe as never,
      listConversations: async () => ({
        nextCursor: null,
        conversations: [conv({ id: ids.c1, peer: { id: ids.u1, displayName: 'Minh' }, lastMessage: recent, lastSeq: 9 }), conv({ id: ids.c2, peer: { id: ids.u2, displayName: 'Lan' }, lastMessage: old, lastSeq: 3 })]
      })
    });
    show(f);
    await screen.findAllByRole('listitem');
    act(() => f.push({ t: 'msg', message: msg(4, { cid: ids.c2, body: 'Lan nhắn nè', createdAt: '2026-11-26T11:00:00.000Z' }) }));
    const items = await screen.findAllByRole('listitem');
    expect(items[0]!.textContent).toContain('Lan');
    expect(items[0]!.textContent).toContain('Lan nhắn nè');
    expect(screen.getByText('1 tin chưa đọc', { selector: '.sr-only' })).toBeTruthy();
  });

  it('rỗng ⇒ có Cu Tít và nút Thêm bạn', async () => {
    show(fakeClient({ me: async () => eligibleMe as never, listConversations: async () => ({ conversations: [], nextCursor: null }) }));
    expect(await screen.findByText('Chưa có cuộc trò chuyện nào')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Thêm bạn' }).getAttribute('href')).toBe('/ban-be/tim');
  });

  it('lỗi mạng ⇒ thông báo + Thử lại, tải lại được', async () => {
    const list = vi.fn().mockRejectedValueOnce({ kind: 'offline' }).mockResolvedValue({ conversations: [], nextCursor: null });
    show(fakeClient({ me: async () => eligibleMe as never, listConversations: list }));
    expect((await screen.findByRole('alert')).textContent).toContain('cần mạng');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Chưa có cuộc trò chuyện nào')).toBeTruthy();
  });

  it('đang nối lại ⇒ thanh "Đang kết nối…"', async () => {
    const f = fakeClient({ me: async () => eligibleMe as never, listConversations: async () => ({ conversations: [conv({ id: ids.c1 })], nextCursor: null }) }, { state: 'reconnecting' });
    show(f);
    expect(await screen.findByText('Đang kết nối…')).toBeTruthy();
  });
});
