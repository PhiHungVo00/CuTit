// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readState, STATE_KEY } from './state';

describe('readState', () => {
  beforeEach(() => localStorage.clear());
  it('lastResponse hỏng/sai kiểu bị bỏ (null), các trường khác giữ', () => {
    localStorage.setItem(STATE_KEY, JSON.stringify({ lastCheckAt: 5, lastResponse: { status: 42, minBuild: 'x' }, snoozedBuild: 3, snoozedUntil: 9 }));
    expect(readState()).toEqual({ lastCheckAt: 5, lastResponse: null, snoozedBuild: 3, snoozedUntil: 9 });
  });
});
