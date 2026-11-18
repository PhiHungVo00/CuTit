import { describe, expect, it } from 'vitest';
import { TONE_SETS } from '@vietlearning/content';
import { START_MS, catchToneRound, minimalPairQuestion, nextTimeLimit, recordListen, toneProgress } from './toneGymModel';

describe('toneGymModel', () => {
  it('cặp tối thiểu: xác định theo seed, 2–3 lựa chọn khác thanh cùng một bộ, đáp án nằm trong lựa chọn', () => {
    for (let seed = 1; seed < 60; seed++) {
      const q = minimalPairQuestion(seed);
      expect(minimalPairQuestion(seed)).toEqual(q);
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(q.options.length).toBeLessThanOrEqual(3);
      expect(new Set(q.options.map((o) => o.tone)).size).toBe(q.options.length);
      expect(q.options.some((o) => o.tone === q.answer)).toBe(true);
      const set = TONE_SETS.find((s) => s.id === q.setId)!;
      for (const o of q.options) expect(set.forms[o.tone]?.vi).toBe(o.vi);
      expect(q.word).toBe(set.forms[q.answer]!.vi);
    }
  });

  it('bắt thanh: n câu, mỗi câu có thanh thật của từ', () => {
    const round = catchToneRound(7, 10);
    expect(round).toHaveLength(10);
    expect(catchToneRound(7, 10)).toEqual(round);
    for (const r of round) expect(TONE_SETS.some((s) => s.forms[r.tone]?.vi === r.word)).toBe(true);
  });

  it('thời gian: đúng thì nhanh dần (×0.85), sai thì chậm lại (×1.15), kẹp 1.5–6 s', () => {
    expect(START_MS).toBe(5000);
    expect(nextTimeLimit(5000, true)).toBe(4250);
    expect(nextTimeLimit(5000, false)).toBe(5750);
    expect(nextTimeLimit(1600, true)).toBe(1500);
    expect(nextTimeLimit(5900, false)).toBe(6000);
  });

  it('tiến bộ từng thanh: điểm nói từ toneStats, tỉ lệ nghe đúng + xu hướng 7 ngày từ dữ liệu phòng tập', () => {
    const now = new Date(2026, 10, 18, 9);
    let byDay = recordListen({}, 'sac', true, now);
    byDay = recordListen(byDay, 'sac', false, now);
    byDay = recordListen(byDay, 'sac', true, new Date(2026, 10, 16, 9));
    const rows = toneProgress({ sac: { n: 2, sum: 150 } }, byDay, now);
    expect(rows).toHaveLength(6);
    const sac = rows.find((r) => r.tone === 'sac')!;
    expect(sac.speakAvg).toBe(75);
    expect(sac.listenRate).toBeCloseTo(2 / 3);
    expect(sac.trend).toHaveLength(7);
    expect(sac.trend[6]).toBe(0.5);
    expect(sac.trend[4]).toBe(1);
    expect(sac.trend[5]).toBeNull();
    const nga = rows.find((r) => r.tone === 'nga')!;
    expect(nga.speakAvg).toBeNull();
    expect(nga.listenRate).toBeNull();
  });

  it('dữ liệu phòng tập chỉ giữ 30 ngày gần nhất', () => {
    let byDay = {};
    for (let d = 0; d < 40; d++) byDay = recordListen(byDay, 'ngang', true, new Date(2026, 9, 1 + d, 9));
    expect(Object.keys(byDay)).toHaveLength(30);
  });
});
