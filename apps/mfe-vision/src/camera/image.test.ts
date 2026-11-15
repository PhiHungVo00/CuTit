import { describe, expect, it } from 'vitest';
import { fitWithin } from './image';

describe('thu nhỏ ảnh trước khi gửi', () => {
  it('giữ tỉ lệ, cạnh dài ≤ 640', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 640, height: 480 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 480, height: 640 });
  });
  it('không phóng to ảnh nhỏ; ảnh rỗng => 0', () => {
    expect(fitWithin(320, 200)).toEqual({ width: 320, height: 200 });
    expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0 });
  });
});
