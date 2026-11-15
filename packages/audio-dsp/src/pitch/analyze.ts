/**
 * Đường ống phân tích một lần phát âm (chạy trong Web Worker, không chặn giao diện):
 * PCM 16 kHz => contour F0 (A1) => semitone tương đối => so với 6 thanh mẫu (A2).
 */
import { createPitchStrategy, type PitchStrategy } from './PitchStrategy.js';
import { toRelativeSemitones } from './semitone.js';
import { compareContours, type ToneComparison } from './dtw.js';

export type ToneId = 'ngang' | 'huyen' | 'sac' | 'hoi' | 'nga' | 'nang';

export interface ToneAnalysisInput {
  pcm: Float32Array;
  sampleRate: number;
  target: ToneId;
  /** contour mẫu (semitone tương đối) của từng thanh, lấy từ packages/content */
  references: Record<ToneId, number[]>;
  strategy?: PitchStrategy['name'];
}

export type ToneAnalysisResult =
  | {
      ok: true;
      target: ToneId;
      targetScore: ToneComparison;
      /** thanh có điểm cao nhất: người học đang phát âm giống thanh nào */
      bestMatch: ToneId;
      scores: Record<ToneId, number>;
      contour: number[];
      timesMs: number[];
      medianHz: number;
      voicedRatio: number;
      processingMs: number;
    }
  | { ok: false; reason: 'no-voice' | 'too-short'; processingMs: number };

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function analyzeTone(input: ToneAnalysisInput): ToneAnalysisResult {
  const t0 = now();
  if (input.pcm.length < input.sampleRate * 0.15) return { ok: false, reason: 'too-short', processingMs: now() - t0 };

  const frames = createPitchStrategy(input.strategy).extractContour(input.pcm, input.sampleRate);
  const voiced = toRelativeSemitones(frames);
  if (!voiced) return { ok: false, reason: 'no-voice', processingMs: now() - t0 };

  const ids = Object.keys(input.references) as ToneId[];
  const comparisons = Object.fromEntries(ids.map((id) => [id, compareContours(voiced.semitones, input.references[id])])) as Record<
    ToneId,
    ToneComparison
  >;
  const bestMatch = ids.reduce((best, id) => (comparisons[id].score > comparisons[best].score ? id : best), ids[0]);

  return {
    ok: true,
    target: input.target,
    targetScore: comparisons[input.target],
    bestMatch,
    scores: Object.fromEntries(ids.map((id) => [id, comparisons[id].score])) as Record<ToneId, number>,
    contour: voiced.semitones,
    timesMs: voiced.timesMs,
    medianHz: Math.round(voiced.medianHz),
    voicedRatio: Math.round(voiced.voicedRatio * 100) / 100,
    processingMs: Math.round(now() - t0)
  };
}
