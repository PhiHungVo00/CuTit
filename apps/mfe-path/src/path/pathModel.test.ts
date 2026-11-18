import { describe, expect, it } from 'vitest';
import { COURSE } from '@vietlearning/content';
import { lessonStatuses, nextLesson, unitProgress, weakestTone } from './pathModel';

const rec = { best: 1, times: 1, at: '2026-11-17T10:00:00.000Z' };

describe('pathModel', () => {
  it('người mới: bài đầu là “tiếp theo”, mọi bài khác vẫn mở (không khóa cứng)', () => {
    const st = lessonStatuses(COURSE, {}, {});
    expect(st.u1l1).toBe('next');
    expect(st.u1l2).toBe('open');
    expect(st.u3l4).toBe('open');
    expect(Object.values(st).filter((x) => x === 'next')).toHaveLength(1);
    expect(nextLesson(COURSE, {}, {}).id).toBe('u1l1');
  });

  it('xong u1l1 => u1l2 là tiếp theo; học nhảy cóc vẫn chọn bài chưa xong đầu tiên', () => {
    expect(nextLesson(COURSE, { u1l1: rec }, {}).id).toBe('u1l2');
    expect(nextLesson(COURSE, { u1l1: rec, u1l3: rec }, {}).id).toBe('u1l2');
    expect(lessonStatuses(COURSE, { u1l1: rec }, {}).u1l1).toBe('done');
  });

  it('vượt unit => mọi bài của unit tính là xong, tiếp theo là unit sau', () => {
    const st = lessonStatuses(COURSE, {}, { u1: '2026-11-17' });
    expect(COURSE.units[0].lessons.every((l) => st[l.id] === 'done')).toBe(true);
    expect(nextLesson(COURSE, {}, { u1: '2026-11-17' }).id).toBe('u2l1');
    expect(unitProgress(COURSE.units[0], {}, { u1: 'x' })).toEqual({ done: 5, total: 5 });
  });

  it('xong hết khóa => “Học tiếp” trỏ bài cuối để ôn lại', () => {
    const all = Object.fromEntries(COURSE.units.flatMap((u) => u.lessons.map((l) => [l.id, rec])));
    expect(nextLesson(COURSE, all, {}).id).toBe('u3l5');
  });

  it('thanh yếu nhất: điểm trung bình thấp nhất, chưa luyện => null', () => {
    expect(weakestTone({ sac: { n: 2, sum: 120 }, hoi: { n: 1, sum: 40 } })).toBe('hoi');
    expect(weakestTone({})).toBeNull();
    expect(weakestTone({ sac: { n: 0, sum: 0 } })).toBeNull();
  });
});
