import { describe, expect, it } from 'vitest';
import { bubbleVisibility, isKeyboardOpen, nextScrollMode } from './useBubbleVisibility';

const base = { pathname: '/', scrollMode: 'full', keyboardOpen: false, audioBusy: false } as const;

describe('bubbleVisibility', () => {
  it('trang thường ⇒ full', () => expect(bubbleVisibility(base)).toBe('full'));
  it('route tập trung ⇒ hidden', () => {
    for (const p of ['/bai-hoc/u1l1', '/kiem-tra/u1', '/hoi-thoai', '/nhap-vai', '/goi-thoai', '/camera'])
      expect(bubbleVisibility({ ...base, pathname: p })).toBe('hidden');
  });
  it('đã cuộn xuống ⇒ mini', () => expect(bubbleVisibility({ ...base, scrollMode: 'mini' })).toBe('mini'));
  it('bàn phím mở ⇒ hidden (thắng cả mini)', () => expect(bubbleVisibility({ ...base, scrollMode: 'mini', keyboardOpen: true })).toBe('hidden'));
  it('đang thu âm/phát âm ⇒ hidden', () => expect(bubbleVisibility({ ...base, audioBusy: true })).toBe('hidden'));
});

describe('nextScrollMode', () => {
  it('cuộn xuống quá 48px ⇒ mini', () => expect(nextScrollMode('full', 100, 40)).toBe('mini'));
  it('cuộn xuống nhưng còn ≤ 48px ⇒ giữ full', () => expect(nextScrollMode('full', 40, 10)).toBe('full'));
  it('cuộn lên ⇒ full', () => expect(nextScrollMode('mini', 90, 100)).toBe('full'));
  it('đứng yên giữ nguyên', () => expect(nextScrollMode('mini', 100, 100)).toBe('mini'));
  it('về đầu trang ⇒ full', () => expect(nextScrollMode('mini', 0, 0)).toBe('full'));
});

describe('isKeyboardOpen', () => {
  it('viewport thấp hơn nền > 150px ⇒ mở', () => expect(isKeyboardOpen(400, 800)).toBe(true));
  it('chênh ≤ 150px ⇒ chưa mở (thanh địa chỉ co giãn)', () => expect(isKeyboardOpen(700, 800)).toBe(false));
});
