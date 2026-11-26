import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { learnerStore } from '@vietlearning/state';
import { FindFriendScreen } from './FindFriend';
import { InviteScreen } from './Invite';
import { eligibleMe, fakeClient, ids } from '../test/fakeClient';
import type { SocialRest } from '../client/types';

const find = (over: Partial<SocialRest> = {}) => {
  const f = fakeClient({ me: async () => eligibleMe as never, ...over });
  render(
    <MemoryRouter>
      <FindFriendScreen client={f.client} />
    </MemoryRouter>
  );
  return f;
};
afterEach(() => {
  cleanup();
  learnerStore.getState().reset();
});

describe('Tìm bạn bằng handle', () => {
  it('nhập handle (chuẩn hóa chữ thường, bỏ @) ⇒ gửi lời mời', async () => {
    const create = vi.fn(async () => undefined);
    find({ createFriendRequest: create });
    fireEvent.change(await screen.findByLabelText('Tên bạn (handle)'), { target: { value: ' @Thu_Ha ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lời mời' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith('thu_ha'));
    expect((await screen.findByRole('status')).textContent).toContain('Đã gửi lời mời');
  });

  it('handle_not_found hiện MỘT câu trung tính; tên sai định dạng không gọi server', async () => {
    const create = vi.fn().mockRejectedValue({ status: 404, code: 'handle_not_found' });
    find({ createFriendRequest: create });
    const input = await screen.findByLabelText('Tên bạn (handle)');
    fireEvent.change(input, { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lời mời' }));
    expect((await screen.findByRole('alert')).textContent).toContain('chưa hợp lệ');
    expect(create).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'nguoi.la' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lời mời' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Không tìm thấy người này. Kiểm tra lại tên bạn.'));
  });

  it('hết lượt lời mời trong ngày ⇒ câu riêng', async () => {
    find({ createFriendRequest: async () => Promise.reject({ status: 429, code: 'request_limit' }) });
    fireEvent.change(await screen.findByLabelText('Tên bạn (handle)'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lời mời' }));
    expect((await screen.findByRole('alert')).textContent).toContain('ngày mai');
  });

  it('lời mời đến: đếm, Chấp nhận / Từ chối', async () => {
    const respond = vi.fn(async () => undefined);
    find({
      respondFriendRequest: respond,
      listFriendRequests: async () => ({ requests: [{ id: ids.c1, from: { displayName: 'Minh' }, createdAt: '2026-11-26T09:00:00.000Z' }, { id: ids.c2, from: { displayName: 'Lan' }, createdAt: '2026-11-26T09:01:00.000Z' }] })
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Lời mời đến (2)' }));
    expect(await screen.findByText('Minh')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Chấp nhận' })[0]!);
    await waitFor(() => expect(respond).toHaveBeenCalledWith(ids.c1, true));
    expect((await screen.findByText('Đã chấp nhận Minh.')).textContent).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    await waitFor(() => expect(respond).toHaveBeenCalledWith(ids.c2, false));
  });

  it('không có lời mời ⇒ trạng thái rỗng; lỗi mạng ⇒ Thử lại', async () => {
    const list = vi.fn().mockResolvedValueOnce({ requests: [] }).mockRejectedValueOnce({ kind: 'offline' }).mockResolvedValue({ requests: [] });
    find({ listFriendRequests: list });
    fireEvent.click(await screen.findByRole('button', { name: 'Lời mời đến' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Chưa có lời mời nào.')).toBeTruthy();
  });

  it('khách ⇒ lời mời tạo tài khoản thay vì ô tìm bạn', async () => {
    find({ me: async () => ({ ...eligibleMe, ineligible: 'guest' }) as never });
    expect(await screen.findByRole('link', { name: 'Tạo tài khoản' })).toBeTruthy();
    expect(screen.queryByLabelText('Tên bạn (handle)')).toBeNull();
  });
});

describe('Nhập mã mời (/moi/:code)', () => {
  const invite = (client: ReturnType<typeof fakeClient>['client'], code?: string) =>
    render(
      <MemoryRouter>
        <InviteScreen client={client} code={code} />
      </MemoryRouter>
    );

  it('điền sẵn mã từ link; kết bạn xong ⇒ Cu Tít khen + về Bạn bè (không cần đủ điều kiện chat)', async () => {
    const accept = vi.fn(async () => ({ friend: { displayName: 'Minh' } }));
    invite(fakeClient({ acceptInvite: accept }).client, 'abcd2345');
    expect((screen.getByLabelText('Mã mời của bạn bè') as HTMLInputElement).value).toBe('ABCD2345');
    fireEvent.click(screen.getByRole('button', { name: 'Kết bạn' }));
    await waitFor(() => expect(accept).toHaveBeenCalledWith('ABCD2345'));
    expect(await screen.findByText('Đã kết bạn với Minh!')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Về màn Bạn bè' }).getAttribute('href')).toBe('/ban-be');
  });

  it('mã sai/hết hạn/của mình ⇒ câu riêng; mã sai định dạng không gọi server', async () => {
    const accept = vi.fn().mockRejectedValue({ status: 400, code: 'invite_invalid' });
    invite(fakeClient({ acceptInvite: accept }).client);
    const input = screen.getByLabelText('Mã mời của bạn bè');
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kết bạn' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Mã không đúng');
    expect(accept).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'ZZZZ2222' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kết bạn' }));
    await waitFor(() => expect(accept).toHaveBeenCalled());
    accept.mockRejectedValue({ status: 400, code: 'self_invite' });
    fireEvent.click(screen.getByRole('button', { name: 'Kết bạn' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('của chính bạn'));
  });
});
