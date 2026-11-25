import { describe, expect, it } from 'vitest';
import { BUSY_ROUTES, isBusy } from './busy';

describe('isBusy (màn bài học/bài tập: không ngắt)', () => {
  it('các màn học/luyện/gọi là bận, kể cả đường con và dấu / cuối', () => {
    for (const p of ['/bai-hoc/u1-b2', '/kiem-tra/u1', '/on-tap', '/luyen-tap', '/ghep-cau', '/nhap-vai', '/phong-thanh', '/goi-thoai', '/luyen-tap/', '/bai-hoc']) {
      expect(isBusy(p), p).toBe(true);
    }
  });
  it('trang chủ, hồ sơ, cài đặt, hub luyện tập chung KHÔNG bận (đoạn đầu khác hẳn)', () => {
    for (const p of ['/', '/ho-so', '/cai-dat/am-thanh', '/luyen-tap-chung', '/ban-be', '/xung-ho']) {
      expect(isBusy(p), p).toBe(false);
    }
  });
  it('BUSY_ROUTES khớp danh sách spec 5.5', () => {
    expect([...BUSY_ROUTES].sort()).toEqual(['/bai-hoc', '/ghep-cau', '/goi-thoai', '/kiem-tra', '/luyen-tap', '/nhap-vai', '/on-tap', '/phong-thanh']);
  });
});
