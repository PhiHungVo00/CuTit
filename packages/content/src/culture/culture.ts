/**
 * Thẻ văn hóa (M10). NGUỒN DUY NHẤT: src/data/culture.json.
 * Thẻ có reviewed=false là bản nháp, cần người bản ngữ duyệt trước khi phát hành (hàng chờ).
 */
import cultureData from '../data/culture.json' with { type: 'json' };

export interface CultureCard {
  id: string;
  title: string;
  category: string;
  content: string;
  /** Bản tiếng Anh cho giao diện tiếng Anh */
  titleEn: string;
  categoryEn: string;
  contentEn: string;
  reviewed: boolean;
}

export const CULTURE_CARDS: readonly CultureCard[] = cultureData as CultureCard[];

/** Bỏ dấu tiếng Việt + chữ thường để so khớp ("dua" khớp "đũa") */
export function foldVietnamese(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

// Từ dừng tiếng Việt (đã bỏ dấu) và tiếng Anh: câu hỏi có thể bằng cả hai ngôn ngữ
const STOP = new Set([
  'la', 'co', 'khong', 'the', 'nao', 'gi', 'cua', 'va', 'cho', 'khi', 'o', 'nhu', 'nguoi', 'viet', 'nam', 'minh', 'toi', 'ban', 'a', 'e', 'nhe', 'sao', 'vay',
  'what', 'how', 'why', 'when', 'can', 'should', 'do', 'does', 'is', 'are', 'you', 'your', 'to', 'in', 'of', 'on', 'for', 'and', 'it', 'at', 'with', 'my', 'be', 'there', 'any', 'about', 'vietnamese', 'vietnam', 'people', 'okay', 'ok'
]);

function tokens(s: string): string[] {
  return foldVietnamese(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/**
 * Truy hồi thẻ liên quan tới câu hỏi (dùng cho /culture/ask và tìm kiếm offline):
 * điểm = số từ khóa trùng, tiêu đề nặng gấp đôi; cụm 2 từ (vd. "cam dua") cộng thêm.
 */
export function searchCulture(query: string, limit = 3): CultureCard[] {
  const q = tokens(query);
  if (q.length === 0) return [];
  const bigrams = q.slice(1).map((t, i) => `${q[i]} ${t}`);
  const scored = CULTURE_CARDS.map((card) => {
    const title = foldVietnamese(`${card.title} ${card.titleEn}`);
    const body = foldVietnamese(`${card.category} ${card.content} ${card.categoryEn} ${card.contentEn}`);
    let score = 0;
    for (const t of q) {
      if (title.includes(t)) score += 2;
      else if (body.includes(t)) score += 1;
    }
    for (const b of bigrams) if (title.includes(b) || body.includes(b)) score += 2;
    return { card, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.card);
}
