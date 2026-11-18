import { PitchReferenceFlyweight, type ExerciseRef, type ToneId } from '@vietlearning/content';
import { isResolvable, parseRefKey } from '@vietlearning/exercises';

/** “Lỗi gần đây” => danh sách bài làm lại (mới nhất trước, bỏ trùng, bỏ khóa không còn nội dung) */
export function mistakeRefs(mistakes: readonly { key: string; at: string }[], limit = 8): ExerciseRef[] {
  const seen = new Set<string>();
  const out: ExerciseRef[] = [];
  for (const m of [...mistakes].reverse()) {
    if (out.length >= limit || seen.has(m.key)) continue;
    seen.add(m.key);
    const ref = parseRefKey(m.key);
    if (ref && isResolvable(ref)) out.push(ref);
  }
  return out;
}

/** Từ mẫu cho mỗi thanh (âm tiết “ma” của dữ liệu thanh + 2 từ quen thuộc trong khóa A1) */
const TONE_WORDS: Record<ToneId, [string, string]> = {
  ngang: ['tên', 'không'],
  huyen: ['chào', 'đường'],
  sac: ['bốn', 'trái'],
  hoi: ['khỏe', 'phở'],
  nga: ['mã', 'ngã'],
  nang: ['chợ', 'chị']
};

/** 3 câu luyện cùng một thanh (dùng cho “thanh điệu yếu nhất”) */
export function toneDrill(tone: ToneId): ExerciseRef[] {
  const words = [PitchReferenceFlyweight.get(tone).syllable, ...TONE_WORDS[tone]];
  return words.map((word) => ({ type: 'tone', tone, word }));
}
