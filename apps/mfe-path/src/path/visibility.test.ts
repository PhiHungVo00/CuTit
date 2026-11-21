import { describe, expect, it } from 'vitest';
import { COURSE, DIALOGUES, findLesson, type Lesson } from '@vietlearning/content';
import { lessonVisible } from './visibility';
import { lessonStatuses, nextLesson, unitProgress } from './pathModel';
import { lessonAfter, lessonHref } from './lessonHref';
import { badgeFacts } from '../motivation/facts';

const rec = { best: 1, times: 1, at: '2026-11-21T10:00:00.000Z' };
const hideRoleplay = (l: Lesson) => lessonVisible(l, false);
const showAll = (l: Lesson) => lessonVisible(l, true);
const allDone = Object.fromEntries(COURSE.units.flatMap((u) => u.lessons.map((l) => [l.id, rec])));

describe('tình huống chưa duyệt không khóa tiến độ (Review Focus 4)', () => {
  it('bài thường luôn hiện; bài tình huống hiện khi có kịch bản đã duyệt hoặc được cho xem nháp', () => {
    expect(lessonVisible(findLesson('u1l1')!.lesson, false)).toBe(true);
    const rp = findLesson('u1l5')!.lesson;
    expect(lessonVisible(rp, true)).toBe(true);
    // kịch bản nháp trong dữ liệu thật là reviewed:false => ẩn ở bản phát hành
    expect(DIALOGUES.every((d) => !d.reviewed)).toBe(true);
    expect(lessonVisible(rp, false)).toBe(false);
  });

  it('mọi bài đều mở /bai-hoc (tình huống không còn chuyển sang /nhap-vai)', () => {
    expect(lessonHref(findLesson('u1l5')!.lesson)).toBe('/bai-hoc/u1l5');
  });

  it('ẩn: unit 1 xong 4/4 dù 5 bài (không bao giờ 5/4), kể cả người dùng cũ đã có u1l5 trong kho', () => {
    const done4 = { u1l1: rec, u1l2: rec, u1l3: rec, u1l4: rec };
    expect(unitProgress(COURSE.units[0], done4, {}, hideRoleplay)).toEqual({ done: 4, total: 4 });
    expect(unitProgress(COURSE.units[0], { ...done4, u1l5: rec }, {}, hideRoleplay)).toEqual({ done: 4, total: 4 });
    expect(unitProgress(COURSE.units[0], done4, {}, showAll)).toEqual({ done: 4, total: 5 });
  });

  it('ẩn: “Học tiếp” nhảy qua bài tình huống; học hết thì trỏ bài cuối còn hiện, không phải bài ẩn', () => {
    const done4 = { u1l1: rec, u1l2: rec, u1l3: rec, u1l4: rec };
    expect(nextLesson(COURSE, done4, {}, hideRoleplay).id).toBe('u2l1');
    expect(nextLesson(COURSE, done4, {}, showAll).id).toBe('u1l5');
    expect(nextLesson(COURSE, allDone, {}, hideRoleplay).id).toBe('u3l4');
    const { u1l5: _drop, u2l5: _d2, u3l5: _d3, ...noRoleplay } = allDone;
    expect(nextLesson(COURSE, noRoleplay, {}, hideRoleplay).id).toBe('u3l4');
  });

  it('ẩn: bài ẩn không có trạng thái trên lộ trình; lối “bỏ qua” bài kế tiếp cũng bỏ bài ẩn', () => {
    const st = lessonStatuses(COURSE, {}, {}, hideRoleplay);
    expect(st.u1l5).toBeUndefined();
    expect(st.u1l1).toBe('next');
    expect(lessonAfter(COURSE, 'u1l4', hideRoleplay)?.id).toBe('u2l1');
    expect(lessonAfter(COURSE, 'u3l4', hideRoleplay)).toBeNull();
  });

  it('huy hiệu unit đạt được khi bài tình huống bị ẩn (không đòi bài ẩn)', () => {
    expect(badgeFacts(COURSE, hideRoleplay).units[0].lessonIds).not.toContain('u1l5');
    expect(badgeFacts(COURSE, showAll).units[0].lessonIds).toContain('u1l5');
  });
});
