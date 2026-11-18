/**
 * Thuật toán A7: Bảng ánh xạ từ vựng phương ngữ Bắc - Trung - Nam.
 * NGUỒN DUY NHẤT: src/data/dialects.json (cần người bản ngữ duyệt, xem hàng chờ Q1).
 */
import dialectData from '../data/dialects.json' with { type: 'json' };

export type Dialect = 'north' | 'central' | 'south';

export interface DialectEntry {
  id: string;
  north: string;
  central: string;
  south: string;
  meaning: string;
  /** false = bản nháp, cần người bản ngữ duyệt (hàng chờ Q1) */
  reviewed: boolean;
}

export const DIALECT_DICTIONARY: DialectEntry[] = dialectData;

/** Tra từ tương ứng ở phương ngữ đích từ một từ của bất kỳ miền nào (so khớp NFC, không phân biệt hoa thường). */
export function translateDialect(word: string, target: Dialect): string | undefined {
  const w = word.normalize('NFC').trim().toLowerCase();
  const entry = DIALECT_DICTIONARY.find((e) => [e.north, e.central, e.south].some((v) => v.normalize('NFC') === w));
  return entry?.[target];
}

/**
 * Mục KHÔNG tự thay trong câu vì đồng hình với từ khác nghĩa (vd. "ngã" = té / thanh ngã / ngã tư,
 * "ốm" Bắc = bệnh nhưng Nam = gầy, "hoa"/"thế"/"ô"/"roi" nhiều nghĩa). Chúng vẫn xuất hiện ở bài "từ theo miền".
 */
const NOT_AUTO_LOCALIZED = new Set(['d4', 'd8', 'd16', 'd18', 'd25', 'd29']);

const localizers = new Map<Dialect, { re: RegExp; map: Map<string, string> }>();

function localizerFor(target: Exclude<Dialect, 'north'>) {
  let l = localizers.get(target);
  if (!l) {
    const entries = DIALECT_DICTIONARY.filter((e) => e.reviewed && !NOT_AUTO_LOCALIZED.has(e.id) && e[target] !== e.north);
    const map = new Map(entries.map((e) => [e.north.normalize('NFC').toLowerCase(), e[target]]));
    // cụm dài trước ("thế nào" trước "thế"); một lượt thay duy nhất => không thay dây chuyền (gầy→ốm→bệnh)
    const alts = [...map.keys()].sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    l = { re: new RegExp(`(?<![\\p{L}\\p{N}])(${alts.join('|')})(?![\\p{L}\\p{N}])`, 'giu'), map };
    localizers.set(target, l);
  }
  return l;
}

/**
 * A7 trong bài học: đổi từ vựng của câu/từ (viết theo miền Bắc) sang miền đích, chỉ thay NGUYÊN TỪ khớp chính xác
 * dạng Bắc của mục đã duyệt; giữ chữ hoa đầu từ. Miền Bắc => giữ nguyên.
 */
export function localizeText(text: string, dialect: Dialect): string {
  const nfc = text.normalize('NFC');
  if (dialect === 'north') return nfc;
  const { re, map } = localizerFor(dialect);
  return nfc.replace(re, (m) => {
    const out = map.get(m.toLowerCase()) ?? m;
    return m[0] !== m[0].toLowerCase() ? out[0].toUpperCase() + out.slice(1) : out;
  });
}
