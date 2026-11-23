/**
 * A3 (phần chuẩn hóa): tách câu tiếng Việt thành âm tiết đã chuẩn hóa NFC để so khớp.
 * Tiếng Việt viết tách từng âm tiết nên âm tiết là đơn vị so khớp tự nhiên ("xin chào" = 2 âm tiết).
 */
import type { ToneId } from '@vietlearning/audio-dsp';

/** Dấu thanh dạng tổ hợp (NFD). Dấu mũ/trăng/móc của nguyên âm (â ă ơ ư ê ô) KHÔNG phải dấu thanh. */
const TONE_MARKS: Record<string, ToneId> = {
  '̀': 'huyen',
  '́': 'sac',
  '̉': 'hoi',
  '̃': 'nga',
  '̣': 'nang'
};
const TONE_MARK_RE = /[̣̀́̉̃]/g;

/** NFC + chữ thường + bỏ dấu câu, tách theo khoảng trắng */
export function syllables(text: string): string[] {
  return text
    .normalize('NFC')
    .toLocaleLowerCase('vi')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function toneOf(syllable: string): ToneId {
  for (const ch of syllable.normalize('NFD')) {
    const t = TONE_MARKS[ch];
    if (t) return t;
  }
  return 'ngang';
}

/** Âm tiết bỏ dấu thanh (giữ nguyên âm có mũ/móc/trăng và đ), dạng NFC chữ thường */
export function baseOf(syllable: string): string {
  return syllable.normalize('NFD').replace(TONE_MARK_RE, '').normalize('NFC').toLocaleLowerCase('vi');
}
