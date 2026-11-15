import { describe, expect, it } from 'vitest';
import { verdict } from './ToneLabScreen';

describe('verdict', () => {
  it('chỉ khen "Rất tốt" khi điểm cao VÀ thanh gần nhất đúng là thanh mục tiêu', () => {
    expect(verdict(86, true).text).toBe('Rất tốt!');
    // Bug thấy trên trình duyệt: 76 điểm nhưng giống thanh nặng hơn => không được khen "Rất tốt"
    expect(verdict(76, false).text).toBe('Gần đúng rồi');
    expect(verdict(40, true).text).toBe('Chưa đúng thanh');
  });
});
