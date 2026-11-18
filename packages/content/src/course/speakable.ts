/**
 * Danh sách văn bản cần đọc của một gói âm thanh (unit × miền) — NGUỒN DUY NHẤT cho script dựng sẵn TTS (Gateway)
 * và cho client tra gói (packages/exercises). Văn bản đã đổi từ theo miền (A7) trừ từ của bài luyện thanh.
 */
import { localizeText, type Dialect } from '../dialects/dialectMap.js';
import { COURSE, findSentence, findWord, sentenceText, type ExerciseRef } from './course.js';

function textsOf(ref: ExerciseRef, dialect: Dialect): string[] {
  switch (ref.type) {
    case 'meaning':
    case 'listen': {
      const w = findWord(ref.word);
      return w ? [localizeText(w.vi, dialect)] : [];
    }
    case 'build':
    case 'fill':
    case 'speak': {
      const s = findSentence(ref.sentence);
      return s ? [localizeText(sentenceText(s), dialect)] : [];
    }
    case 'tone':
      return [ref.word.normalize('NFC')];
    default:
      return [];
  }
}

/** Văn bản đọc của gói `pack` (id unit, vd. "u1") cho miền `dialect`, bỏ trùng theo NFC, giữ thứ tự xuất hiện */
export function speakableTexts(pack: string, dialect: Dialect): string[] {
  const unit = COURSE.units.find((u) => u.id === pack);
  if (!unit) return [];
  const refs = [...unit.lessons.flatMap((l) => l.exercises), ...unit.testOut];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of refs.flatMap((r) => textsOf(r, dialect))) {
    const k = t.normalize('NFC').trim();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}
