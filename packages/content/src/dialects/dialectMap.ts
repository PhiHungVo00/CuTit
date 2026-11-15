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
}

export const DIALECT_DICTIONARY: DialectEntry[] = dialectData;

/** Tra từ tương ứng ở phương ngữ đích từ một từ của bất kỳ miền nào (so khớp NFC, không phân biệt hoa thường). */
export function translateDialect(word: string, target: Dialect): string | undefined {
  const w = word.normalize('NFC').trim().toLowerCase();
  const entry = DIALECT_DICTIONARY.find((e) => [e.north, e.central, e.south].some((v) => v.normalize('NFC') === w));
  return entry?.[target];
}
