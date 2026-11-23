import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { learnerStore } from '@vietlearning/state';
import type { FriendsResponse } from '@vietlearning/contracts/api';
import type { FriendsApi } from './FriendsPanel';
import { FriendsScreen } from './FriendsScreen';

beforeEach(() => learnerStore.getState().setPreferences({ uiLanguage: 'vi' }));
afterEach(() => {
  cleanup();
  learnerStore.getState().reset();
});

const api = (data: Partial<FriendsResponse>): FriendsApi => ({ list: vi.fn(async () => ({ displayName: 'Lan', invite: null, maxFriends: 5, friends: [], ...data })) }) as unknown as FriendsApi;
const show = (a: FriendsApi) =>
  render(
    <MemoryRouter>
      <FriendsScreen api={a} />
    </MemoryRouter>
  );

describe('FriendsScreen', () => {
  it('trạng thái rỗng: có FriendsPanel và Cu Tít chào', async () => {
    show(api({}));
    expect(await screen.findByRole('img', { name: 'Bé Cu Tít đang chào bạn' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Bạn bè' })).toBeTruthy();
  });

  it('đã có bạn: không hiện Cu Tít chào', async () => {
    const friend = {
      id: '11111111-1111-4111-8111-111111111111',
      displayName: 'Tom',
      since: '2026-11-01T00:00:00.000Z',
      quest: { weekStart: '2026-11-16', weekEnd: '2026-11-22', goalMinutes: 60, totalMinutes: 5, completed: false, members: [{ displayName: 'Lan', minutes: 5, me: true }], streakWeeks: 0 }
    };
    show(api({ friends: [friend] }));
    await screen.findAllByText(/Tom/);
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Bé Cu Tít đang chào bạn' })).toBeNull());
  });
});
