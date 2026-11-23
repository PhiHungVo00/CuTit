/**
 * GoF Flyweight Pattern (12): dữ liệu contour mẫu của 6 thanh điệu được nạp MỘT lần và dùng chung,
 * không cấp phát lại mỗi lần so sánh.
 *
 * NGUỒN DUY NHẤT: src/data/tones.json. Contour là semitone TƯƠNG ĐỐI (0 = cao độ thường của người nói)
 * theo giọng Bắc, 10 điểm cách đều thời gian. Đây là hình dạng xấp xỉ theo mô tả ngữ âm học;
 * cần đối chiếu với bản ghi người bản ngữ (hàng chờ Q14).
 */
import toneData from '../data/tones.json' with { type: 'json' };

export type ToneId = 'ngang' | 'huyen' | 'sac' | 'hoi' | 'nga' | 'nang';

export interface ToneReference {
  id: ToneId;
  name: string;
  mark: string;
  syllable: string;
  meaning: string;
  description: string;
  nameEn: string;
  markEn: string;
  meaningEn: string;
  descriptionEn: string;
  contour: readonly number[];
}

const TONES = Object.freeze((toneData as ToneReference[]).map((t) => Object.freeze({ ...t, contour: Object.freeze([...t.contour]) })));
const BY_ID = new Map<ToneId, ToneReference>(TONES.map((t) => [t.id, t]));

export class PitchReferenceFlyweight {
  static all(): readonly ToneReference[] {
    return TONES;
  }

  static get(id: ToneId): ToneReference {
    const t = BY_ID.get(id);
    if (!t) throw new Error(`Không có thanh điệu "${id}"`);
    return t;
  }

  /** Bảng contour cho bộ phân tích A2 (dạng Record id => contour) */
  static contours(): Record<ToneId, number[]> {
    return Object.fromEntries(TONES.map((t) => [t.id, [...t.contour]])) as Record<ToneId, number[]>;
  }
}
