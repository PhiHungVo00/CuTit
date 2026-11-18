/**
 * Dựng sẵn âm thanh khóa học theo miền (D9). Chạy được nhiều lần:
 *  - tệp đã `ok` => bỏ qua; `unverified` (đã tổng hợp nhưng chưa kiểm lại) => chỉ kiểm lại, KHÔNG tổng hợp lại;
 *  - `rejected` (STT nghe ra khác nguyên văn: model đọc sai/thêm từ) => tổng hợp lại tới `maxTries` lần rồi thôi;
 *  - TTS hết hạn mức (429) hoặc STT kiểm lại lỗi (vd. 503 llm_busy) => dừng êm, lưu trạng thái, lần sau chạy tiếp.
 * Kiểm lại = âm tiết (NFC, bỏ dấu câu, chữ thường) của lời STT chép phải TRÙNG HOÀN TOÀN câu gốc.
 * Manifest gói chỉ gồm tệp `ok` — client không bao giờ nhận tệp chưa kiểm hoặc đọc sai.
 * `humanReview` (giọng Trung: STT nghe thanh Huế kém, không làm trọng tài được): tệp tổng hợp xong ở trạng thái
 * `review` (lời STT chỉ để tham khảo), KHÔNG vào manifest cho tới khi người nghe duyệt (`approveReviewed`).
 */
import type { AudioPack } from '@vietlearning/contracts';
import { ttsCacheKey } from '../../cache/TTSCacheProxy.js';
import { GatewayError } from '../../pipeline/RequestPipeline.js';
import type { SttProvider } from '../../providers/stt.js';
import { ttsVoiceId, type Dialect, type TtsProvider } from '../../providers/tts.js';
import { syllables } from '../assessment/text.js';
import type { FileAudioStore } from './audioStore.js';

export type EntryStatus = 'ok' | 'rejected' | 'unverified' | 'review';

export interface StateEntry {
  text: string;
  status: EntryStatus;
  /** lời STT chép được ở lần kiểm gần nhất */
  heard?: string;
  /** số lần đã tổng hợp */
  tries: number;
}

export interface PrebuildOptions {
  pack: string;
  dialect: Dialect;
  texts: readonly string[];
  tts: TtsProvider;
  stt: SttProvider;
  store: FileAudioStore;
  /** số lần tổng hợp tối đa cho một câu bị loại */
  maxTries?: number;
  /** tối đa số lần gọi TTS trong lần chạy này */
  limit?: number;
  log?: (line: string) => void;
  /** cần người nghe duyệt từng tệp (không dùng STT làm trọng tài) */
  humanReview?: boolean;
}

export interface PrebuildSummary {
  total: number;
  ok: number;
  rejected: number;
  unverified: number;
  review: number;
  missing: number;
  synthesized: number;
  verified: number;
  stoppedBy: null | 'tts-quota' | 'tts-error' | 'stt-error' | 'limit';
  rejectedList: { text: string; heard: string }[];
}

/** STT hay viết số bằng chữ số ("2 ly") — đổi 0–10 về chữ trước khi so */
const DIGIT_WORDS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười'];
const spoken = (s: string) => syllables(s).map((w) => (/^\d+$/.test(w) && Number(w) <= 10 ? DIGIT_WORDS[Number(w)] : w));
export const matchesVerbatim = (text: string, heard: string) => spoken(text).join(' ') === spoken(heard).join(' ');

export async function runPrebuild(o: PrebuildOptions): Promise<PrebuildSummary> {
  const log = o.log ?? (() => undefined);
  const maxTries = o.maxTries ?? 2;
  const stateName = `state/${o.pack}-${o.dialect}.json`;
  const state = (await o.store.readJson<Record<string, StateEntry>>(stateName)) ?? {};
  const voiceId = ttsVoiceId(o.tts, o.dialect);
  const keyOf = (text: string) => ttsCacheKey({ text, voiceId, speed: 1, dialect: o.dialect });
  const save = () => o.store.writeJson(stateName, state);

  let synthesized = 0;
  let verified = 0;
  let stoppedBy: PrebuildSummary['stoppedBy'] = null;

  for (const raw of o.texts) {
    const text = raw.normalize('NFC').trim();
    const key = keyOf(text);
    const st = state[key];
    const onDisk = await o.store.has(key);
    if ((st?.status === 'ok' || st?.status === 'review') && onDisk) continue;
    if (st?.status === 'rejected' && st.tries >= maxTries) continue;

    let wav: Uint8Array | null = null;
    if (!(st?.status === 'unverified' && onDisk)) {
      if (o.limit !== undefined && synthesized >= o.limit) {
        stoppedBy = 'limit';
        break;
      }
      try {
        wav = (await o.tts.synthesize({ text, dialect: o.dialect })).wav;
      } catch (err) {
        stoppedBy = err instanceof GatewayError && err.code === 'tts_quota_exhausted' ? 'tts-quota' : 'tts-error';
        log(`DỪNG (${stoppedBy}) ở “${text}”: ${(err as Error).message}`);
        break;
      }
      synthesized++;
      await o.store.write(key, wav);
      state[key] = { text, status: 'unverified', tries: (st?.tries ?? 0) + 1 };
      await save();
    } else {
      wav = await o.store.read(key);
    }

    if (o.humanReview) {
      let heard: string | undefined;
      try {
        heard = (await o.stt.transcribe({ bytes: Buffer.from(wav!), mimetype: 'audio/wav' })).text;
      } catch {
        /* chỉ để tham khảo */
      }
      state[key] = { ...state[key], text, status: 'review', heard };
      log(`CHỜ NGHE “${text}”${heard ? ` — STT: “${heard}”` : ''}`);
      await save();
      continue;
    }

    try {
      const heard = (await o.stt.transcribe({ bytes: Buffer.from(wav!), mimetype: 'audio/wav' })).text;
      verified++;
      const ok = matchesVerbatim(text, heard);
      // Hết lượt tạo lại mà STT vẫn không khớp => để NGƯỜI nghe quyết (STT hay chép sai từ đơn/giọng miền),
      // không vứt tệp; vẫn không vào manifest cho tới khi duyệt.
      // Từ đơn: Whisper chép âm tiết đứng riêng rất kém (đo F0 cho thấy model đọc đúng thanh nhưng STT nghe
      // ra từ khác) => không tạo lại vô ích, chuyển thẳng sang người nghe.
      const exhausted = !ok && ((state[key]?.tries ?? 0) >= maxTries || syllables(text).length <= 1);
      const status: EntryStatus = ok ? 'ok' : exhausted ? 'review' : 'rejected';
      state[key] = { ...state[key], text, status, heard };
      log(`${ok ? 'ĐẠT ' : exhausted ? 'CHỜ NGHE' : 'LOẠI'} “${text}”${ok ? '' : ` — nghe ra “${heard}”`}`);
    } catch (err) {
      stoppedBy = 'stt-error';
      log(`DỪNG (stt-error) khi kiểm “${text}”: ${(err as Error).message} — để lại unverified`);
      await save();
      break;
    }
    await save();
  }

  // Manifest: chỉ tệp đã kiểm đạt
  const items: Record<string, string> = {};
  const counts = { ok: 0, rejected: 0, unverified: 0, review: 0, missing: 0 };
  const rejectedList: PrebuildSummary['rejectedList'] = [];
  for (const raw of o.texts) {
    const text = raw.normalize('NFC').trim();
    const key = keyOf(text);
    const st = state[key];
    if (!st) counts.missing++;
    else counts[st.status]++;
    if (st?.status === 'ok') items[text] = key;
    if (st?.status === 'rejected') rejectedList.push({ text, heard: st.heard ?? '' });
  }
  const pack: AudioPack = { version: 1, pack: o.pack, dialect: o.dialect, model: o.tts.model, voice: o.tts.voiceFor?.(o.dialect) ?? o.tts.voice, items };
  await o.store.writeJson(`packs/${o.pack}-${o.dialect}.json`, pack);

  return { total: o.texts.length, ...counts, synthesized, verified, stoppedBy, rejectedList };
}

/**
 * Người nghe đã duyệt (vd. giọng Trung): chuyển các tệp `review` sang `ok`, trừ những câu trong `reject`
 * (bị đánh dấu đọc sai => `rejected`, lần chạy sau tổng hợp lại). Gọi runPrebuild lại để ghi manifest.
 */
export async function approveReviewed(store: FileAudioStore, pack: string, dialect: Dialect, reject: readonly string[] = []) {
  const stateName = `state/${pack}-${dialect}.json`;
  const state = (await store.readJson<Record<string, StateEntry>>(stateName)) ?? {};
  const bad = new Set(reject.map((t) => t.normalize('NFC').trim()));
  let approved = 0;
  let rejected = 0;
  for (const st of Object.values(state)) {
    if (st.status !== 'review') continue;
    if (bad.has(st.text)) {
      st.status = 'rejected';
      st.tries = 0; // người nghe loại => cho tạo lại đủ lượt
      rejected++;
    } else {
      st.status = 'ok';
      approved++;
    }
  }
  await store.writeJson(stateName, state);
  return { approved, rejected };
}
