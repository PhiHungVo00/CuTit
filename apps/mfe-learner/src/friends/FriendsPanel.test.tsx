import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { learnerStore } from '@vietlearning/state';
import type { FriendQuest, FriendsResponse } from '@vietlearning/contracts/api';
import { FriendsPanel, type FriendsApi } from './FriendsPanel';

beforeEach(() => learnerStore.getState().setPreferences({ uiLanguage: 'vi' }));
afterEach(() => {
  cleanup();
  learnerStore.getState().reset();
});

const err = (status: number, code: string) => Object.assign(new Error(code), { status, code, kind: status === 429 ? 'quota' : 'server' });

const quest = (over: Partial<FriendQuest['quest']> = {}): FriendQuest => ({
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Tom',
  since: '2026-11-01T00:00:00.000Z',
  quest: {
    weekStart: '2026-11-16',
    weekEnd: '2026-11-22',
    goalMinutes: 60,
    totalMinutes: 35,
    completed: false,
    members: [
      { displayName: 'Lan', minutes: 20, me: true },
      { displayName: 'Tom', minutes: 15, me: false }
    ],
    streakWeeks: 0,
    ...over
  }
});

function fakeApi(state: Partial<FriendsResponse> = {}, over: Partial<FriendsApi> = {}) {
  const data: FriendsResponse = { displayName: 'Lan', invite: null, maxFriends: 5, friends: [], ...state };
  const api: FriendsApi = {
    list: vi.fn(async () => structuredClone(data)),
    setName: vi.fn(async (n: string) => {
      data.displayName = n;
      return n;
    }),
    invite: vi.fn(async () => (data.invite = { code: 'ABCD-EFGH', expiresAt: '2026-11-20T10:00:00.000Z' })),
    accept: vi.fn(async () => {
      const q = quest();
      data.friends.push(q);
      return q;
    }),
    setGoal: vi.fn(async (_id: string, goal: number) => {
      data.friends[0].quest.goalMinutes = goal;
      return data.friends[0];
    }),
    remove: vi.fn(async () => void data.friends.splice(0, 1)),
    ...over
  };
  return api;
}

describe('FriendsPanel (GĐ4c bạn học hợp tác)', () => {
  it('chưa có tên hiển thị: phải đặt tên trước, tên sai báo lỗi', async () => {
    const api = fakeApi({ displayName: null }, { setName: vi.fn(async () => Promise.reject(err(400, 'invalid_request'))) });
    render(<FriendsPanel api={api} />);
    const input = await screen.findByLabelText('Tên hiển thị cho bạn bè');
    expect(screen.queryByRole('button', { name: 'Tạo mã mời' })).toBeNull();
    fireEvent.change(input, { target: { value: 'bob@mail' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu tên' }));
    expect(await screen.findByText(/Tên chưa hợp lệ/)).toBeTruthy();
  });

  it('tạo mã mời rồi nhập mã của bạn => thấy nhiệm vụ chung dạng “chúng ta”, mình đứng trước', async () => {
    const api = fakeApi();
    render(<FriendsPanel api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tạo mã mời' }));
    expect((await screen.findByTestId('friend-invite-code')).textContent).toBe('ABCD-EFGH');

    fireEvent.change(screen.getByLabelText('Mã mời của bạn bè'), { target: { value: 'wxyz-1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kết bạn' }));
    expect(await screen.findByText('✓ Đã kết bạn với Tom!')).toBeTruthy();
    expect(api.accept).toHaveBeenCalledWith('wxyz-1234', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(screen.getByText('Chúng ta: 35/60 phút tuần này')).toBeTruthy();
    expect(screen.getByText('Còn 25 phút nữa là cả hai cùng đạt.')).toBeTruthy();
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['Bạn: 20 phút', 'Tom: 15 phút']);
  });

  it('mã sai => câu báo lỗi rõ theo mã lỗi của Gateway', async () => {
    const api = fakeApi({}, { accept: vi.fn(async () => Promise.reject(err(404, 'invite_invalid'))) });
    render(<FriendsPanel api={api} />);
    fireEvent.change(await screen.findByLabelText('Mã mời của bạn bè'), { target: { value: 'ABCD-EFGH' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kết bạn' }));
    expect(await screen.findByText(/Mã không đúng, đã dùng hoặc đã hết hạn/)).toBeTruthy();
  });

  it('đạt mục tiêu + streak; đổi mục tiêu; hủy kết bạn cần xác nhận', async () => {
    const api = fakeApi({ friends: [quest({ totalMinutes: 65, completed: true, streakWeeks: 3 })] });
    render(<FriendsPanel api={api} />);
    expect(await screen.findByText('🎉 Chúng ta đã đạt mục tiêu tuần!')).toBeTruthy();
    expect(screen.getByText('🔥 3 tuần liên tiếp cùng đạt')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Mục tiêu chung mỗi tuần'), { target: { value: '90' } });
    await waitFor(() => expect(api.setGoal).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 90, expect.any(String)));
    fireEvent.click(screen.getByRole('button', { name: 'Hủy kết bạn' }));
    expect(api.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Có, hủy kết bạn' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Chưa có bạn học/)).toBeTruthy();
  });

  it('tài khoản trẻ em: chỉ hiện câu báo, không có form kết bạn', async () => {
    const api = fakeApi({}, { list: vi.fn(async () => Promise.reject(err(403, 'social_not_allowed'))) });
    render(<FriendsPanel api={api} />);
    expect(await screen.findByText('Hồ sơ trẻ em không dùng tính năng bạn học.')).toBeTruthy();
    expect(screen.queryByLabelText('Mã mời của bạn bè')).toBeNull();
  });

  it('tiếng Anh', async () => {
    learnerStore.getState().setPreferences({ uiLanguage: 'en' });
    render(<FriendsPanel api={fakeApi({ friends: [quest()] })} />);
    expect(await screen.findByText('Together: 35/60 minutes this week')).toBeTruthy();
  });
});
