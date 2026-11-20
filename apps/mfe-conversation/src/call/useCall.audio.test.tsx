// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { isAudioBusy } from '@vietlearning/shared/audio/focus';

vi.mock('@vietlearning/native', () => ({ getDeviceSpeech: () => ({ speak: vi.fn(async () => undefined), stop: vi.fn(async () => undefined) }) }));
vi.mock('@vietlearning/state', () => ({
  learnerStore: { getState: () => ({ preferences: { voiceId: 'v', dialect: 'north' } }) },
  speechRate: (b: number) => b
}));
vi.mock('@vietlearning/api-client', () => ({ request: vi.fn(async () => ({ turns: { limit: 10, used: 0 } })) }));
vi.mock('../chat/useChatSession', () => ({ useChatSession: () => ({ send: vi.fn(), retry: vi.fn(), cancel: vi.fn(), error: null, errorCode: null }) }));
vi.mock('../chat/useVoiceInput', () => ({ useVoiceInput: () => ({ start: vi.fn(async () => undefined), cancel: vi.fn(), error: null }) }));

import { useCall } from './useCall';

describe('useCall báo điều phối âm thanh', () => {
  it('cả cuộc gọi là bận: từ START tới gác máy', async () => {
    const { result } = renderHook(() => useCall());
    expect(isAudioBusy()).toBe(false);
    await act(async () => result.current.dispatch({ type: 'START' }));
    expect(isAudioBusy()).toBe(true);
    await act(async () => result.current.dispatch({ type: 'HANG_UP' }));
    expect(isAudioBusy()).toBe(false);
  });

  it('rời màn giữa cuộc gọi (unmount) ⇒ hết bận', async () => {
    const { result, unmount } = renderHook(() => useCall());
    await act(async () => result.current.dispatch({ type: 'START' }));
    expect(isAudioBusy()).toBe(true);
    unmount();
    expect(isAudioBusy()).toBe(false);
  });
});
