/**
 * A3 (phần căn chỉnh): Levenshtein trên âm tiết. Chi phí thay thế: cùng âm tiết 0, chỉ khác dấu thanh 0.4
 * (để "la" ghép với "là" thay vì coi là xóa + chèn), khác hẳn 1; chèn/xóa 1.
 */
import { baseOf } from './text.js';

export interface AlignedPair {
  expected: string | null;
  heard: string | null;
}

const subCost = (a: string, b: string) => (a === b ? 0 : baseOf(a) === baseOf(b) ? 0.4 : 1);
const eq = (a: number, b: number) => Math.abs(a - b) < 1e-9;

export function alignSyllables(expected: string[], heard: string[]): AlignedPair[] {
  const n = expected.length;
  const m = heard.length;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i][j] = Math.min(d[i - 1][j - 1] + subCost(expected[i - 1], heard[j - 1]), d[i - 1][j] + 1, d[i][j - 1] + 1);
    }
  }
  // Truy vết từ cuối. Khi bằng chi phí: ghép cặp khớp/chỉ sai thanh trước, rồi thiếu, rồi thừa, cuối cùng mới
  // "sai hẳn" — nên người học dừng sớm ("chào anh" cho "chào chị ạ") ra sai + THIẾU Ở CUỐI, không phải thiếu giữa câu.
  const out: AlignedPair[] = [];
  let i = n;
  let j = m;
  const pair = () => {
    out.push({ expected: expected[i - 1], heard: heard[j - 1] });
    i--;
    j--;
  };
  while (i > 0 || j > 0) {
    const sub = i > 0 && j > 0 ? subCost(expected[i - 1], heard[j - 1]) : Infinity;
    if (sub < 1 && eq(d[i][j], d[i - 1][j - 1] + sub)) pair();
    else if (i > 0 && eq(d[i][j], d[i - 1][j] + 1)) {
      out.push({ expected: expected[i - 1], heard: null });
      i--;
    } else if (j > 0 && eq(d[i][j], d[i][j - 1] + 1)) {
      out.push({ expected: null, heard: heard[j - 1] });
      j--;
    } else pair();
  }
  return out.reverse();
}
