/**
 * Thuật toán A8: kiểm tra trật tự câu "ghép đốt tre" (M8 Sentence Builder).
 * Hàm thuần, KHÔNG phụ thuộc Zod: dùng chung cho Gateway (/v1/sentence/check) và app khi offline.
 *
 * 1. Khớp token người học xếp với token của câu (NFC, không phân biệt hoa thường).
 * 2. Đúng nếu trùng MỘT trong các thứ tự chấp nhận (trạng ngữ thời gian/nơi chốn tiếng Việt di chuyển được).
 * 3. Sai thì giải thích bằng luật trật tự tiếng Việt dựa trên nhãn ngữ pháp của token,
 *    và chỉ ra các từ lệch chỗ bằng LCS (chuỗi con chung dài nhất) với thứ tự đúng gần nhất.
 */

export type TokenTag =
  | 'S' // chủ ngữ
  | 'V' // động từ
  | 'O' // tân ngữ
  | 'N' // danh từ
  | 'CLF' // loại từ: con, cái, quyển...
  | 'NUM' // số / lượng từ
  | 'DEM' // chỉ định: này, kia, ấy
  | 'MOD' // tính từ bổ nghĩa cho danh từ (áo ĐỎ)
  | 'ADJ' // tính từ làm vị ngữ
  | 'ADV' // phó từ: rất, lắm, quá...
  | 'AUX' // đang, đã, sẽ
  | 'NEG' // không, chưa (phủ định trước động từ)
  | 'Q' // tiểu từ hỏi cuối câu: không, chưa, đấy...
  | 'QW' // từ để hỏi: gì, đâu, nào...
  | 'TIME'
  | 'PLACE'
  | 'PREP'
  | 'INTJ';

export interface SentenceToken {
  text: string;
  tag: TokenTag;
}

export interface SentenceItem {
  id: string;
  tokens: SentenceToken[];
  /** các thứ tự đúng, mỗi thứ tự là dãy chỉ số token; accepted[0] là thứ tự chuẩn */
  accepted: number[][];
}

export interface OrderCheckResult {
  valid: boolean;
  errors: string[];
  hint?: string;
  /** chỉ số (trong câu người học xếp) của các từ đặt sai chỗ */
  misplaced: number[];
  /** thứ tự chuẩn để hiện sau khi kiểm tra */
  correctOrder: string[];
}

const norm = (s: string) => s.normalize('NFC').trim().toLocaleLowerCase('vi');

/** Đổi chuỗi người học xếp thành chỉ số token; null nếu thiếu/thừa/lạ từ */
function toIndices(item: SentenceItem, userTexts: string[]): number[] | null {
  if (userTexts.length !== item.tokens.length) return null;
  const used = new Set<number>();
  const out: number[] = [];
  for (const t of userTexts) {
    const i = item.tokens.findIndex((tok, idx) => !used.has(idx) && norm(tok.text) === norm(t));
    if (i < 0) return null;
    used.add(i);
    out.push(i);
  }
  return out;
}

/** Độ dài LCS + tập vị trí (trong a) thuộc LCS */
function lcs(a: number[], b: number[]): { length: number; inA: Set<number> } {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const inA = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      inA.add(i);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return { length: dp[0][0], inA };
}

/** Luật trật tự tiếng Việt, kiểm tra trên câu người học xếp (theo nhãn của token) */
export type OrderLang = 'vi' | 'en';

/** Lời giải thích lỗi trật tự theo ngôn ngữ giao diện (ví dụ tiếng Việt giữ nguyên trong ngoặc kép) */
const M: Record<OrderLang, {
  clf(w: string): string;
  num(w: string): string;
  dem(w: string): string;
  mod(w: string): string;
  q(w: string): string;
  aux(w: string, verb: string): string;
  svo(subj: string): string;
  useAll: string;
  misplaced(list: string): string;
  hint(first: string): string;
}> = {
  vi: {
    clf: (w) => `Loại từ "${w}" phải đứng ngay trước danh từ (vd. "con mèo", "quyển sách").`,
    num: (w) => `Số lượng "${w}" đứng trước loại từ hoặc danh từ (vd. "hai con mèo").`,
    dem: (w) => `Từ chỉ định "${w}" đứng ngay SAU danh từ (vd. "quyển sách này").`,
    mod: (w) => `Tính từ "${w}" đứng SAU danh từ nó bổ nghĩa (vd. "áo đỏ", không nói "đỏ áo").`,
    q: (w) => `Tiểu từ hỏi "${w}" đứng ở cuối câu.`,
    aux: (w, verb) => `"${w}" đứng ngay TRƯỚC động từ "${verb}".`,
    svo: (subj) => `Chủ ngữ "${subj}" thường đứng trước động từ (Chủ ngữ – Động từ – Tân ngữ).`,
    useAll: 'Hãy dùng đủ và đúng các từ đã cho, mỗi từ một lần.',
    misplaced: (list) => `Vị trí của ${list} chưa đúng.`,
    hint: (first) => `Gợi ý: câu bắt đầu bằng "${first}".`
  },
  en: {
    clf: (w) => `The classifier "${w}" must come right before its noun (e.g. "con mèo", "quyển sách").`,
    num: (w) => `The number "${w}" comes before the classifier or noun (e.g. "hai con mèo").`,
    dem: (w) => `The demonstrative "${w}" comes right AFTER the noun (e.g. "quyển sách này").`,
    mod: (w) => `The adjective "${w}" comes AFTER the noun it describes (e.g. "áo đỏ", not "đỏ áo").`,
    q: (w) => `The question particle "${w}" goes at the end of the sentence.`,
    aux: (w, verb) => `"${w}" goes right BEFORE the verb "${verb}".`,
    svo: (subj) => `The subject "${subj}" usually comes before the verb (Subject – Verb – Object).`,
    useAll: 'Use every given word exactly once.',
    misplaced: (list) => `${list} ${list.includes(',') ? 'are' : 'is'} in the wrong place.`,
    hint: (first) => `Hint: the sentence starts with "${first}".`
  }
};

function ruleErrors(item: SentenceItem, order: number[], lang: OrderLang = 'vi'): string[] {
  const tag = (pos: number) => item.tokens[order[pos]]?.tag;
  const text = (pos: number) => item.tokens[order[pos]].text;
  const errors = new Set<string>();
  const canonical = item.accepted[0];

  order.forEach((tokIdx, pos) => {
    const t = item.tokens[tokIdx].tag;
    if (t === 'CLF' && tag(pos + 1) !== 'N')
      errors.add(M[lang].clf(text(pos)));
    if (t === 'NUM' && tag(pos + 1) !== 'CLF' && tag(pos + 1) !== 'N')
      errors.add(M[lang].num(text(pos)));
    if (t === 'DEM' && tag(pos - 1) !== 'N')
      errors.add(M[lang].dem(text(pos)));
    if (t === 'MOD' && tag(pos - 1) !== 'N')
      errors.add(M[lang].mod(text(pos)));
    if (t === 'Q' && pos !== order.length - 1) errors.add(M[lang].q(text(pos)));
    if (t === 'AUX' || t === 'NEG') {
      // trong câu chuẩn, từ này đứng ngay trước một động từ: người học cũng phải đặt ngay trước động từ đó
      const cPos = canonical.indexOf(tokIdx);
      const verb = canonical[cPos + 1];
      if (verb !== undefined && item.tokens[verb].tag === 'V' && order[pos + 1] !== verb)
        errors.add(M[lang].aux(text(pos), item.tokens[verb].text));
    }
  });

  const subj = item.tokens.findIndex((t) => t.tag === 'S');
  const firstVerb = canonical.find((i) => item.tokens[i].tag === 'V');
  if (subj >= 0 && firstVerb !== undefined && canonical.indexOf(subj) < canonical.indexOf(firstVerb)) {
    if (order.indexOf(subj) > order.indexOf(firstVerb))
      errors.add(M[lang].svo(item.tokens[subj].text));
  }
  return [...errors];
}

export function checkSentenceOrder(item: SentenceItem, userTexts: string[], lang: OrderLang = 'vi'): OrderCheckResult {
  const correctOrder = item.accepted[0].map((i) => item.tokens[i].text);
  const order = toIndices(item, userTexts);
  if (!order) {
    return {
      valid: false,
      errors: [M[lang].useAll],
      misplaced: [],
      correctOrder
    };
  }
  if (item.accepted.some((acc) => acc.length === order.length && acc.every((v, i) => v === order[i]))) {
    return { valid: true, errors: [], misplaced: [], correctOrder };
  }

  // Thứ tự đúng gần nhất (LCS dài nhất) để chỉ ra các từ lệch chỗ
  const best = item.accepted.map((acc) => lcs(order, acc)).reduce((a, b) => (b.length > a.length ? b : a));
  const misplaced = order.map((_, pos) => pos).filter((pos) => !best.inA.has(pos));
  const errors = ruleErrors(item, order, lang);
  if (errors.length === 0 && misplaced.length) {
    errors.push(M[lang].misplaced(misplaced.map((p) => `"${item.tokens[order[p]].text}"`).join(', ')));
  }
  const first = item.tokens[item.accepted[0][0]].text;
  return {
    valid: false,
    errors,
    hint: M[lang].hint(first),
    misplaced,
    correctOrder
  };
}
