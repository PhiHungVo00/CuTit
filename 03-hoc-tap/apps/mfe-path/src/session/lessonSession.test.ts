import { describe, expect, it } from 'vitest';
import type { ExerciseRef } from '@vietlearning/content';
import { answer, current, MAX_RETRIES, startSession, summarize } from './lessonSession';

const r = (word: string): ExerciseRef => ({ type: 'meaning', word, dir: 'vi-en' });
const key = (word: string) => `meaning:${word}:vi-en`;

describe('lessonSession', () => {
  it('câu sai quay lại cuối phiên; độ chính xác tính theo lần đầu', () => {
    let s = startSession([r('w1'), r('w2'), r('w3')]);
    expect(current(s)?.key).toBe(key('w1'));
    s = answer(s, { key: key('w1'), correct: true, skipped: false });
    s = answer(s, { key: key('w2'), correct: false, skipped: false });
    expect(s.queue.map((q) => q.key)).toEqual([key('w1'), key('w2'), key('w3'), key('w2')]);
    s = answer(s, { key: key('w3'), correct: true, skipped: false });
    expect(s.done).toBe(false);
    expect(current(s)?.attempt).toBe(2);
    s = answer(s, { key: key('w2'), correct: true, skipped: false });
    expect(s.done).toBe(true);
    expect(summarize(s)).toEqual({ total: 3, firstTryCorrect: 2, accuracy: 2 / 3, mistakes: [key('w2')], skipped: 0 });
  });

  it('sai mãi vẫn kết thúc: mỗi câu quay lại tối đa MAX_RETRIES lần', () => {
    let s = startSession([r('w1'), r('w2')]);
    let steps = 0;
    while (!s.done && steps < 50) {
      s = answer(s, { key: current(s)!.key, correct: false, skipped: false });
      steps++;
    }
    expect(s.done).toBe(true);
    expect(steps).toBe(2 * (1 + MAX_RETRIES));
    expect(summarize(s).firstTryCorrect).toBe(0);
  });

  it('bỏ qua (không nghe/nói được) không tính sai và không quay lại', () => {
    let s = startSession([r('w1'), r('w2')]);
    s = answer(s, { key: key('w1'), correct: false, skipped: true });
    s = answer(s, { key: key('w2'), correct: true, skipped: false });
    expect(s.done).toBe(true);
    expect(summarize(s)).toMatchObject({ total: 1, firstTryCorrect: 1, accuracy: 1, mistakes: [], skipped: 1 });
  });

  it('ref trùng trong một bài vẫn được tính riêng; trả lời khóa không khớp câu hiện tại bị bỏ qua', () => {
    let s = startSession([r('w1'), r('w1')]);
    s = answer(s, { key: 'khác', correct: true, skipped: false });
    expect(s.pos).toBe(0);
    s = answer(s, { key: key('w1'), correct: true, skipped: false });
    s = answer(s, { key: key('w1'), correct: true, skipped: false });
    expect(summarize(s).total).toBe(2);
  });

  it('kiểm tra vượt unit (maxRetries 0): câu sai không quay lại', () => {
    let s = startSession([r('w1'), r('w2')], 0);
    s = answer(s, { key: key('w1'), correct: false, skipped: false });
    s = answer(s, { key: key('w2'), correct: true, skipped: false });
    expect(s.done).toBe(true);
    expect(summarize(s).accuracy).toBe(0.5);
  });

  it('phiên rỗng kết thúc ngay', () => {
    expect(startSession([]).done).toBe(true);
  });
});
