/**
 * GoF Strategy Pattern (13): hoán đổi giải thuật trích xuất cao độ (YIN / McLeod)
 * mà nơi gọi không cần biết chi tiết.
 */
import { extractContourWith, yinPitch, type ContourOptions, type PitchFrame } from './yin.js';
import { mcleodPitch } from './mcleod.js';

export interface PitchStrategy {
  readonly name: 'yin' | 'mcleod';
  extractContour(pcm: Float32Array, sampleRate: number, opts?: ContourOptions): PitchFrame[];
}

export class YINPitchStrategy implements PitchStrategy {
  readonly name = 'yin' as const;
  extractContour(pcm: Float32Array, sampleRate: number, opts?: ContourOptions) {
    return extractContourWith(yinPitch, pcm, sampleRate, opts);
  }
}

export class McLeodPitchStrategy implements PitchStrategy {
  readonly name = 'mcleod' as const;
  extractContour(pcm: Float32Array, sampleRate: number, opts?: ContourOptions) {
    return extractContourWith(mcleodPitch, pcm, sampleRate, opts);
  }
}

export function createPitchStrategy(name: PitchStrategy['name'] = 'yin'): PitchStrategy {
  return name === 'mcleod' ? new McLeodPitchStrategy() : new YINPitchStrategy();
}
