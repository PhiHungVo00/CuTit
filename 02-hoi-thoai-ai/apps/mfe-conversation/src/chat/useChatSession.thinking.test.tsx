import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { EventBus } from '@vietlearning/shared';

const sendTurn = vi.hoisted(() => vi.fn());
vi.mock('./chatClient', async (orig) => ({ ...(await orig<typeof import('./chatClient')>()), sendTurn }));

import { useChatSession } from './useChatSession';
import { TurnError } from './chatClient';

const events: boolean[] = [];
const off = EventBus.getInstance().subscribe('cutit:thinking', (d: { thinking: boolean }) => events.push(d.thinking));
afterEach(() => {
  events.length = 0;
  sendTurn.mockReset();
});

describe('chat phát cutit:thinking khi chờ AI', () => {
  it('thành công: true rồi false', async () => {
    sendTurn.mockResolvedValue({ reply: 'chào', completedTasks: [], newWords: [], mock: false });
    const { result } = renderHook(() => useChatSession());
    await act(async () => result.current.send('xin chào'));
    expect(events).toEqual([true, false]);
  });

  it('lỗi: vẫn false (finally)', async () => {
    sendTurn.mockRejectedValue(new TurnError('server', 'hỏng'));
    const { result } = renderHook(() => useChatSession());
    await act(async () => result.current.send('xin chào'));
    expect(events).toEqual([true, false]);
  });

  it('rời màn giữa lượt ⇒ cũng tắt', async () => {
    let rej!: (e: unknown) => void;
    sendTurn.mockReturnValue(new Promise((_, r) => (rej = r)));
    const { result, unmount } = renderHook(() => useChatSession());
    await act(async () => void result.current.send('xin chào'));
    expect(events).toEqual([true]);
    unmount();
    await act(async () => rej(new Error('aborted')));
    expect(events).toEqual([true, false]);
  });
});
void off;
