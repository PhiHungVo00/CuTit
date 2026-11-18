/**
 * Bộ âm tiết cùng phần vần, khác thanh (cặp tối thiểu) cho phòng tập thanh điệu (GĐ2). Chỉ từ có thật;
 * thanh nào không có từ thông dụng thì bỏ trống. Bản nháp: reviewed=false tới khi người bản ngữ duyệt.
 */
import data from '../data/toneSets.json' with { type: 'json' };
import type { ToneId } from './PitchReferenceFlyweight.js';

export interface ToneSet {
  id: string;
  base: string;
  forms: Partial<Record<ToneId, { vi: string; en: string }>>;
  reviewed: boolean;
}

export const TONE_SETS: readonly ToneSet[] = data as ToneSet[];
