import { describe, expect, it } from 'vitest';
import type { Dialogue } from '@vietlearning/content';
import { runStep, scoreRun } from './engine';

const d: Dialogue = {
  id: 't',
  unit: 'u1',
  aiScenarioId: 'sc5',
  title: 'T',
  titleEn: 'T',
  reviewed: true,
  start: 'a',
  nodes: [
    {
      id: 'a',
      cutit: 'Chào con!',
      cutitEn: 'Hi!',
      context: { speakerAge: 10, listenerAge: 50, relation: 'social' },
      a6: { speaker: 'cháu', listener: 'cô' },
      options: [
        { text: 'Cháu chào cô ạ', textEn: 'x', next: 'b', a6: { speaker: 'cháu', listener: 'cô' } },
        { text: 'Tao chào mày', textEn: 'x', next: 'b', a6: { speaker: 'tao', listener: 'mày' } },
        { text: 'Cháu chào cô', textEn: 'x', next: 'end-retry', a6: { speaker: 'cháu', listener: 'cô' } }
      ]
    },
    { id: 'b', cutit: 'Tạm biệt', cutitEn: 'Bye', options: [{ text: 'Tạm biệt', textEn: 'Bye', next: 'end-ok' }, { text: 'Hừ', textEn: 'Hmph', next: 'end-retry' }] }
  ]
};

describe('runStep', () => {
  it('xưng hô đúng theo bản chụp A6 => honorificOk', () => {
    expect(runStep(d, 'a', 0)).toEqual({ next: 'b', honorificOk: true, graded: true });
  });
  it('xưng hô sai => honorificOk false nhưng vẫn rẽ nhánh theo lựa chọn', () => {
    expect(runStep(d, 'a', 1)).toEqual({ next: 'b', honorificOk: false, graded: true });
  });
  it('nút không chấm xưng hô => graded false, honorificOk true', () => {
    expect(runStep(d, 'b', 0)).toEqual({ next: 'end-ok', honorificOk: true, graded: false });
  });
  it('nút hoặc lựa chọn không tồn tại => lỗi rõ ràng', () => {
    expect(() => runStep(d, 'zz', 0)).toThrow(/zz/);
    expect(() => runStep(d, 'a', 9)).toThrow(/9/);
  });
});

describe('scoreRun', () => {
  it('đếm số nút chấm xưng hô đúng ngay lần đầu', () => {
    expect(scoreRun([{ honorificOk: true, graded: true }, { honorificOk: false, graded: true }, { honorificOk: true, graded: false }])).toEqual({ total: 2, ok: 1, honorificScore: 0.5 });
  });
  it('không có nút chấm => điểm 1, tổng 0', () => {
    expect(scoreRun([{ honorificOk: true, graded: false }])).toEqual({ total: 0, ok: 0, honorificScore: 1 });
  });
});
