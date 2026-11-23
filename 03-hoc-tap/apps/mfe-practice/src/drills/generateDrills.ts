/**
 * Sinh bài tập M5 theo MẪU từ kho nội dung đã có (phương ngữ, 20 cặp xưng hô, 60 câu).
 * TDD dự kiến LLM sinh bài (/v1/practice/generate — hiện là mock); bản này chạy offline, xác định theo seed.
 * "Thích ứng": thẻ đến hạn ôn (SM-2) lên trước; số lựa chọn và cấp câu theo trình độ người học.
 * GoF Factory Method: mỗi dạng bài có một hàm dựng riêng (make*).
 */
import { DIALECT_DICTIONARY, HONORIFIC_PAIRS_20, SENTENCE_ITEMS, type Dialect } from '@vietlearning/content';
import { learnerStore } from '@vietlearning/state';
import { meaningFor, t as tr } from '../i18n';

/** Đề bài sinh theo ngôn ngữ giao diện lúc tạo phiên */
const lang = () => learnerStore.getState().preferences.uiLanguage;

export type DrillType = 'quiz' | 'fill' | 'listen' | 'match' | 'repeat';

interface Base {
  /** khóa ổn định của nội dung => itemRef thẻ ôn 'drill:<key>' */
  key: string;
  type: DrillType;
  prompt: string;
}
export interface ChoiceDrill extends Base {
  type: 'quiz' | 'fill' | 'listen';
  /** câu/từ sẽ được đọc lên (dạng nghe chọn) */
  speak?: string;
  options: string[];
  answer: string;
  explanation: string;
}
export interface MatchDrill extends Base {
  type: 'match';
  pairs: { left: string; right: string }[];
}
export interface RepeatDrill extends Base {
  type: 'repeat';
  text: string;
  translation: string;
}
export type Drill = ChoiceDrill | MatchDrill | RepeatDrill;

function rng(seed: number) {
  let s = Math.abs(Math.floor(seed)) % 2147483646 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
function shuffle<T>(arr: readonly T[], r: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pick<T>(arr: readonly T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length)];
}
/** Lựa chọn: đáp án + nhiễu KHÁC đáp án, không trùng nhau */
function options(answer: string, pool: string[], n: number, r: () => number): string[] {
  const distractors = shuffle([...new Set(pool.filter((p) => p !== answer))], r).slice(0, n - 1);
  return shuffle([answer, ...distractors], r);
}

function makeDialectQuiz(r: () => number, n: number): ChoiceDrill {
  const differing = DIALECT_DICTIONARY.filter((e) => e.north !== e.south);
  const e = pick(differing, r);
  // Chỉ hỏi miền có từ KHÁC miền Bắc (tránh câu hỏi vô nghĩa "miền Trung gọi 'ngã' là gì? — ngã")
  const regions = (['south', 'central'] as const).filter((d) => e[d] !== e.north);
  const target: Dialect = pick(regions, r);
  const answer = e[target];
  return {
    key: `dialect:${e.id}:${target}`,
    type: 'quiz',
    prompt: tr('qDialect', { region: tr(`region.${target}`), word: e.north }),
    options: options(answer, DIALECT_DICTIONARY.map((x) => x[target]).concat(DIALECT_DICTIONARY.map((x) => x.north)), n, r),
    answer,
    explanation: tr('qDialectExplain', { meaning: meaningFor(e.meaning, lang()), north: e.north, central: e.central, south: e.south })
  };
}

function makeHonorificQuiz(r: () => number, n: number): ChoiceDrill {
  const p = pick(HONORIFIC_PAIRS_20, r);
  return {
    key: `honorific:${p.id}`,
    type: 'quiz',
    prompt: tr('qHonorific', { relation: lang() === 'en' && p.relationNameEn ? p.relationNameEn : p.relationName, listener: p.listener }),
    options: options(p.speaker, HONORIFIC_PAIRS_20.map((x) => x.speaker), n, r),
    answer: p.speaker,
    explanation: `${p.example} — ${lang() === 'en' && p.explanationEn ? p.explanationEn : p.explanation}`
  };
}

function makeFill(r: () => number, n: number, maxLevel: number): ChoiceDrill {
  const items = SENTENCE_ITEMS.filter((s) => s.level <= maxLevel && s.tokens.length >= 3);
  const s = pick(items, r);
  const candidates = s.tokens.map((t, i) => ({ t, i })).filter(({ t }) => ['V', 'O', 'N', 'ADJ', 'MOD', 'QW'].includes(t.tag));
  const { t, i } = pick(candidates.length ? candidates : s.tokens.map((t, i) => ({ t, i })), r);
  const order = s.accepted[0];
  const shown = order.map((idx) => (idx === i ? '____' : s.tokens[idx].text)).join(' ');
  const sameTag = SENTENCE_ITEMS.flatMap((x) => x.tokens.filter((k) => k.tag === t.tag).map((k) => k.text));
  return {
    key: `fill:${s.id}:${i}`,
    type: 'fill',
    prompt: tr('qFill', { shown, translation: s.translation }),
    options: options(t.text, sameTag, n, r),
    answer: t.text,
    explanation: tr('qFillExplain', { sentence: order.map((idx) => s.tokens[idx].text).join(' ') })
  };
}

function makeListen(r: () => number, n: number): ChoiceDrill {
  const tones = ['ma', 'mà', 'má', 'mả', 'mã', 'mạ'];
  if (r() < 0.5) {
    const answer = pick(tones, r);
    return {
      key: `listen:tone:${answer}`,
      type: 'listen',
      prompt: tr('qTone'),
      speak: answer,
      options: options(answer, tones, n, r),
      answer,
      explanation: tr('qToneExplain')
    };
  }
  const e = pick(DIALECT_DICTIONARY, r);
  return {
    key: `listen:word:${e.id}`,
    type: 'listen',
    prompt: tr('qWord'),
    speak: e.north,
    options: options(e.north, DIALECT_DICTIONARY.map((x) => x.north), n, r),
    answer: e.north,
    explanation: `“${e.north}”: ${meaningFor(e.meaning, lang())}.`
  };
}

function makeMatch(r: () => number): MatchDrill {
  const chosen = shuffle(
    DIALECT_DICTIONARY.filter((e) => e.north !== e.south),
    r
  ).slice(0, 4);
  return {
    key: `match:${chosen.map((e) => e.id).sort().join('-')}`,
    type: 'match',
    prompt: tr('qMatch'),
    pairs: chosen.map((e) => ({ left: e.north, right: e.south }))
  };
}

function makeRepeat(r: () => number, maxLevel: number): RepeatDrill {
  const s = pick(
    SENTENCE_ITEMS.filter((x) => x.level <= maxLevel),
    r
  );
  return {
    key: `repeat:${s.id}`,
    type: 'repeat',
    prompt: tr('qRepeat'),
    text: s.accepted[0].map((i) => s.tokens[i].text).join(' '),
    translation: s.translation
  };
}

/** Dựng lại bài từ khóa của thẻ ôn đến hạn (để ôn đúng nội dung đã sai) */
export function drillFromKey(key: string, level: number, seed: number): Drill | null {
  const r = rng(seed);
  const n = level <= 1 ? 3 : 4;
  const [kind, a, b] = key.split(':');
  if (kind === 'dialect') {
    const e = DIALECT_DICTIONARY.find((x) => x.id === a);
    const target = b as Dialect;
    if (!e || !e[target]) return null;
    return {
      key,
      type: 'quiz',
      prompt: tr('qDialect', { region: tr(`region.${target}`), word: e.north }),
      options: options(e[target], DIALECT_DICTIONARY.map((x) => x[target]), n, r),
      answer: e[target],
      explanation: tr('qDialectExplain', { meaning: meaningFor(e.meaning, lang()), north: e.north, central: e.central, south: e.south })
    };
  }
  if (kind === 'honorific') {
    const p = HONORIFIC_PAIRS_20.find((x) => x.id === a);
    if (!p) return null;
    return {
      key,
      type: 'quiz',
      prompt: tr('qHonorific', { relation: lang() === 'en' && p.relationNameEn ? p.relationNameEn : p.relationName, listener: p.listener }),
      options: options(p.speaker, HONORIFIC_PAIRS_20.map((x) => x.speaker), n, r),
      answer: p.speaker,
      explanation: `${p.example} — ${lang() === 'en' && p.explanationEn ? p.explanationEn : p.explanation}`
    };
  }
  return null;
}

/**
 * Một phiên luyện tập: thẻ đến hạn trước, rồi đủ 5 dạng bài, xen kẽ.
 * @param dueKeys khóa của thẻ ôn đến hạn (itemRef bỏ tiền tố 'drill:')
 */
export function generateSession(opts: { level: number; seed: number; dueKeys?: string[]; size?: number }): Drill[] {
  const { level, seed, dueKeys = [], size = 8 } = opts;
  const r = rng(seed);
  const n = level <= 1 ? 3 : 4;
  const maxLevel = Math.max(1, level + 1);
  const out: Drill[] = [];
  const keys = new Set<string>();
  const push = (d: Drill | null) => {
    if (d && !keys.has(d.key) && out.length < size) {
      keys.add(d.key);
      out.push(d);
    }
  };
  dueKeys.forEach((k, i) => push(drillFromKey(k, level, seed + i)));

  const makers: (() => Drill)[] = [
    () => makeDialectQuiz(r, n),
    () => makeFill(r, n, maxLevel),
    () => makeListen(r, n),
    () => makeMatch(r),
    () => makeHonorificQuiz(r, n),
    () => makeRepeat(r, maxLevel)
  ];
  for (let i = 0, guard = 0; out.length < size && guard < 200; i++, guard++) push(makers[i % makers.length]());
  return out;
}
