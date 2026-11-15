import { describe, expect, it } from 'vitest';
import { TurnStateMachine } from './TurnStateMachine';

describe('TurnStateMachine', () => {
  it('đi đúng vòng đời lượt thoại và báo mỗi lần đổi', () => {
    const seen: string[] = [];
    const m = new TurnStateMachine((s) => seen.push(s));
    expect(m.transition('UPLOADING')).toBe(true);
    expect(m.transition('STREAMING')).toBe(true);
    expect(m.transition('STREAMING')).toBe(true); // lặp lại cùng trạng thái: không báo
    expect(m.transition('IDLE')).toBe(true);
    expect(seen).toEqual(['UPLOADING', 'STREAMING', 'IDLE']);
  });

  it('chặn chuyển sai (IDLE → STREAMING, UPLOADING → PLAYING); reset luôn về IDLE', () => {
    const m = new TurnStateMachine();
    expect(m.transition('STREAMING')).toBe(false);
    expect(m.getState()).toBe('IDLE');
    m.transition('UPLOADING');
    expect(m.transition('PLAYING')).toBe(false);
    expect(m.isBusy()).toBe(true);
    m.reset();
    expect(m.isBusy()).toBe(false);
  });
});
