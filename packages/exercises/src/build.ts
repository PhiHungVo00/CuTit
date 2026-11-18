/**
 * Dựng bài tập cụ thể từ tham chiếu của khóa học (ExerciseRef). Xác định theo seed: cùng ref + seed => cùng
 * lựa chọn, để phiên học dựng lại được và test e2e tính trước được. Không có thuật toán học mới ở đây
 * (chỉ chọn nhiễu ngẫu nhiên có seed); chấm ghép câu dùng A8, luyện thanh dùng A1/A2.
 */
import {
  ALL_SENTENCES,
  COURSE_WORDS,
  DIALECT_DICTIONARY,
  HONORIFIC_PAIRS_20,
  PitchReferenceFlyweight,
  findSentence,
  findWord,
  sentenceText,
  type ExerciseRef,
  type ToneId
} from '@vietlearning/content';
import { learnerStore } from '@vietlearning/state';
import { meaningFor, t } from './i18n';
import type { ExerciseItem } from './types';

const lang = () => learnerStore.getState().preferences.uiLanguage;

export function rng(seed: number): () => number {
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

const norm = (s: string) => s.normalize('NFC').trim().toLocaleLowerCase('vi');

/** Đáp án + (n-1) nhiễu khác đáp án, không trùng nhau (so khớp NFC, không phân biệt hoa thường) */
function options(answer: string, pool: readonly string[], n: number, r: () => number): string[] {
  const seen = new Set([norm(answer)]);
  const distractors: string[] = [];
  for (const p of shuffle(pool, r)) {
    if (distractors.length >= n - 1) break;
    if (seen.has(norm(p))) continue;
    seen.add(norm(p));
    distractors.push(p);
  }
  return shuffle([answer, ...distractors], r);
}

const wordNum = (id: string) => Number(id.slice(1));
/** Nhiễu ưu tiên từ gần về id (cùng unit, cùng chủ đề) */
function nearWords(id: string, count = 8) {
  const n = wordNum(id);
  return COURSE_WORDS.filter((w) => w.id !== id)
    .sort((a, b) => Math.abs(wordNum(a.id) - n) - Math.abs(wordNum(b.id) - n))
    .slice(0, count);
}

const toneName = (id: ToneId) => {
  const tone = PitchReferenceFlyweight.get(id);
  return (lang() === 'en' ? tone.nameEn : tone.name).toLowerCase();
};

/**
 * Nhiễu cho bài chọn đại từ: bỏ những cách xưng cũng chấp nhận được với cùng người nghe, để không chấm sai
 * một câu trả lời đúng: “tôi” (trung tính, lịch sự trong nhiều tình huống), cách xưng của các cặp khác có
 * cùng người nghe, và cặp “cháu”/“con” trong gia đình.
 */
function pronounDistractors(answer: string, listener: string): string[] {
  const listeners = new Set(listener.split('/').map(norm));
  const sameListener = HONORIFIC_PAIRS_20.filter((x) => x.listener.split('/').some((l) => listeners.has(norm(l)))).map((x) => norm(x.speaker));
  const kin = ['cháu', 'con'].includes(norm(answer)) ? ['cháu', 'con'] : [];
  const banned = new Set([...sameListener, ...kin, 'tôi']);
  return HONORIFIC_PAIRS_20.map((x) => x.speaker).filter((sp) => !banned.has(norm(sp)));
}

/** Khóa ổn định của một ref: dùng cho thẻ ôn, “lỗi gần đây”, câu sai quay lại */
export function refKey(ref: ExerciseRef): string {
  switch (ref.type) {
    case 'meaning':
      return `meaning:${ref.word}:${ref.dir}`;
    case 'listen':
      return `listen:${ref.word}`;
    case 'fill':
      return `fill:${ref.sentence}:${ref.blank}`;
    case 'build':
      return `build:${ref.sentence}`;
    case 'tone':
      return `tone:${ref.tone}:${ref.word}`;
    case 'pronoun':
      return `pronoun:${ref.pair}`;
    case 'dialect':
      return `dialect:${ref.entry}:${ref.region}`;
    case 'speak':
      return `speak:${ref.sentence}`;
  }
}

/** Ngược của refKey; khóa lạ/hỏng => null */
export function parseRefKey(key: string): ExerciseRef | null {
  const [type, a, b] = key.split(':');
  if (!a) return null;
  switch (type) {
    case 'meaning':
      return b === 'vi-en' || b === 'en-vi' ? { type, word: a, dir: b } : null;
    case 'listen':
      return { type, word: a };
    case 'fill':
      return b !== undefined && /^\d+$/.test(b) ? { type, sentence: a, blank: Number(b) } : null;
    case 'build':
      return { type, sentence: a };
    case 'tone':
      return b ? { type, tone: a as ToneId, word: b } : null;
    case 'pronoun':
      return { type, pair: a };
    case 'dialect':
      return b === 'central' || b === 'south' ? { type, entry: a, region: b } : null;
    case 'speak':
      return { type, sentence: a };
    default:
      return null;
  }
}

/** Ref có trỏ tới nội dung có thật không (khóa cũ trong “lỗi gần đây” có thể đã bị xóa khỏi kho) */
export function isResolvable(ref: ExerciseRef): boolean {
  try {
    buildItem(ref, 1);
    return true;
  } catch {
    return false;
  }
}

export function buildItem(ref: ExerciseRef, seed: number, choices = 4): ExerciseItem {
  const r = rng(seed);
  const key = refKey(ref);
  switch (ref.type) {
    case 'meaning': {
      const w = findWord(ref.word);
      if (!w) throw new Error(`Không có từ ${ref.word}`);
      const near = nearWords(w.id);
      const note = lang() === 'en' ? w.noteEn : w.note;
      const explanation = `“${w.vi}” = ${w.en}.${note ? ` ${note}` : ''}`;
      if (ref.dir === 'vi-en') {
        return { kind: 'choice', key, variant: 'meaning', prompt: t('qMeaningViEn', { word: w.vi }), speak: w.vi, options: options(w.en, near.map((x) => x.en), choices, r), answer: w.en, explanation };
      }
      return { kind: 'choice', key, variant: 'meaning', prompt: t('qMeaningEnVi', { meaning: w.en }), options: options(w.vi, near.map((x) => x.vi), choices, r), answer: w.vi, explanation };
    }
    case 'listen': {
      const w = findWord(ref.word);
      if (!w) throw new Error(`Không có từ ${ref.word}`);
      return {
        kind: 'choice',
        key,
        variant: 'listen',
        prompt: t('qListen'),
        speak: w.vi,
        options: options(w.vi, nearWords(w.id).map((x) => x.vi), choices, r),
        answer: w.vi,
        explanation: `“${w.vi}” = ${w.en}.`
      };
    }
    case 'fill': {
      const s = findSentence(ref.sentence);
      const tok = s?.tokens[ref.blank];
      if (!s || !tok) throw new Error(`Không có câu ${ref.sentence}#${ref.blank}`);
      const order = s.accepted[0];
      const sentence = order.map((i) => s.tokens[i].text).join(' ');
      const shown = order.map((i) => (i === ref.blank ? '____' : s.tokens[i].text)).join(' ');
      const pool = ALL_SENTENCES.flatMap((x) => x.tokens.filter((k) => k.tag === tok.tag).map((k) => k.text));
      return {
        kind: 'choice',
        key,
        variant: 'fill',
        prompt: t('qFill'),
        display: shown,
        hint: s.translation,
        options: options(tok.text, pool, choices, r),
        answer: tok.text,
        explanation: t('exFill', { sentence, translation: s.translation })
      };
    }
    case 'build': {
      const s = findSentence(ref.sentence);
      if (!s) throw new Error(`Không có câu ${ref.sentence}`);
      return { kind: 'build', key, prompt: t('qBuild', { translation: s.translation }), sentence: s };
    }
    case 'tone': {
      PitchReferenceFlyweight.get(ref.tone); // ném lỗi nếu thanh lạ
      return { kind: 'tone', key, prompt: t('qTone', { word: ref.word, tone: toneName(ref.tone) }), tone: ref.tone, word: ref.word };
    }
    case 'pronoun': {
      const p = HONORIFIC_PAIRS_20.find((x) => x.id === ref.pair);
      if (!p) throw new Error(`Không có cặp ${ref.pair}`);
      const en = lang() === 'en';
      return {
        kind: 'choice',
        key,
        variant: 'pronoun',
        prompt: t('qPronoun', { relation: en && p.relationNameEn ? p.relationNameEn : p.relationName, listener: p.listener }),
        options: options(p.speaker, pronounDistractors(p.speaker, p.listener), choices, r),
        answer: p.speaker,
        explanation: `${p.example} — ${en && p.explanationEn ? p.explanationEn : p.explanation}`
      };
    }
    case 'dialect': {
      const e = DIALECT_DICTIONARY.find((x) => x.id === ref.entry);
      if (!e || e[ref.region] === e.north) throw new Error(`Không có mục ${ref.entry}/${ref.region}`);
      const answer = e[ref.region];
      // Nhiễu: chỉ lấy từ không phải tên gọi khác của CÙNG vật ở bất kỳ miền nào
      const pool = DIALECT_DICTIONARY.filter((x) => x.id !== e.id).flatMap((x) => [x[ref.region], x.north]);
      return {
        kind: 'choice',
        key,
        variant: 'dialect',
        prompt: t('qDialect', { region: t(`region.${ref.region}`), word: e.north }),
        options: options(answer, pool.filter((p) => ![e.north, e.central, e.south].map(norm).includes(norm(p))), choices, r),
        answer,
        explanation: t('exDialect', { meaning: meaningFor(e.meaning, lang()), north: e.north, central: e.central, south: e.south })
      };
    }
    case 'speak': {
      const s = findSentence(ref.sentence);
      if (!s) throw new Error(`Không có câu ${ref.sentence}`);
      return { kind: 'speak', key, prompt: t('qSpeak'), text: sentenceText(s), translation: s.translation };
    }
  }
}
