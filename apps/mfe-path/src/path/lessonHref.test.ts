import { describe, expect, it } from 'vitest';
import { COURSE, findLesson } from '@vietlearning/content';
import { lessonAfter, lessonHref } from './lessonHref';
import { nextLesson, unitProgress } from './pathModel';

const rec = { best: 1, times: 1, at: '2026-11-18T10:00:00.000Z' };

describe('bài nhập vai cuối unit (GĐ3)', () => {
  it('mọi bài (kể cả tình huống cuối unit) mở /bai-hoc', () => {
    expect(lessonHref(findLesson('u1l1')!.lesson)).toBe('/bai-hoc/u1l1');
    expect(lessonHref(findLesson('u1l5')!.lesson)).toBe('/bai-hoc/u1l5');
    expect(lessonHref(findLesson('u3l5')!.lesson)).toBe('/bai-hoc/u3l5');
  });

  it('xong 4 bài của unit 1 => “Học tiếp” là nhập vai; unit có 5 bài', () => {
    const done = { u1l1: rec, u1l2: rec, u1l3: rec, u1l4: rec };
    expect(nextLesson(COURSE, done, {}).id).toBe('u1l5');
    expect(unitProgress(COURSE.units[0], done, {})).toEqual({ done: 4, total: 5 });
  });

  it('lối ra khi chưa nhập vai được (offline/hết lượt): bài kế tiếp theo thứ tự, bài cuối khóa => null', () => {
    expect(lessonAfter(COURSE, 'u1l5')?.id).toBe('u2l1');
    expect(lessonAfter(COURSE, 'u1l2')?.id).toBe('u1l3');
    expect(lessonAfter(COURSE, 'u3l5')).toBeNull();
  });
});
