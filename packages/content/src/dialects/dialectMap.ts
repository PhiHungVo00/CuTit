/**
 * Thuật toán A7: Bảng Ánh xạ Từ vựng Phương ngữ Bắc - Trung - Nam
 */
export interface DialectEntry {
  north: string;
  central: string;
  south: string;
  meaning: string;
}

export const DIALECT_DICTIONARY: DialectEntry[] = [
  { north: 'ngô', central: 'bắp', south: 'bắp', meaning: 'Bắp ngô (Corn)' },
  { north: 'lạc', central: 'đậu phụng', south: 'đậu phộng', meaning: 'Hạt lạc/đậu (Peanut)' },
  { north: 'dứa', central: 'khóm', south: 'thơm', meaning: 'Quả dứa (Pineapple)' },
  { north: 'mận', central: 'mận', south: 'roi', meaning: 'Quả mận / quả roi' },
  { north: 'muỗng', central: 'thìa', south: 'muỗng', meaning: 'Cái thìa múc (Spoon)' }
];
