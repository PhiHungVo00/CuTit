/**
 * Dựng sẵn âm thanh khóa học theo miền (D9). Chạy được nhiều lần:
 *  - tệp đã `ok` => bỏ qua; `unverified` (đã tổng hợp nhưng chưa kiểm lại) => chỉ kiểm lại, KHÔNG tổng hợp lại;
 *  - `rejected` (STT nghe ra khác nguyên văn: model đọc sai/thêm từ) => tổng hợp lại tới `maxTries` lần rồi thôi;
 *  - TTS hết hạn mức (429) hoặc STT kiểm lại lỗi (vd. 503 llm_busy) => dừng êm, lưu trạng thái, lần sau chạy tiếp.
 * Kiểm lại = âm tiết (NFC, bỏ dấu câu, chữ thường) của lời STT chép phải TRÙNG HOÀN TOÀN câu gốc.
 * Manifest gói chỉ gồm tệp `ok` — client không bao giờ nhận tệp chưa kiểm hoặc đọc sai.
 */
import type { AudioPack } from '@vietlearning/contracts';
import { ttsCacheKey } from '../../cache/TTSCacheProxy.js';
import { GatewayError } from '../../pipeline/RequestPipeline.js';
import type { SttProvider } from '../../providers/stt.js';
import { ttsVoiceId, type Dialect, type TtsProvider } from '../../providers/tts.js';
import { syllables } from '../assessment/text.js';
import type { FileAudioStore } from './audioStore.js';

export type EntryStatus = 'ok' | 'rejected' | 'unverified';

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
}

export interface PrebuildSummary {
  total: number;
  ok: number;
  rejected: number;
  unverified: number;
  missing: number;
  synthesized: number;
  verified: number;
  stoppedBy: null | 'tts-quota' | 'tts-error' | 'stt-error' | 'limit';
  rejectedList: { text: string; heard: string }[];
}

export const matchesVerbatim = (text: string, heard: string) => syllables(text).join(' ') === syllables(heard).join(' ');

export async function runPrebuild(o: PrebuildOptions): Promise<PrebuildSummary> {
  const log = o.log ?? (() => undefined);
  const maxTries = o.maxTries ?? 2;
  const stateName = `state/${o.pack}-${o.dialect}.json`;
  const state = (await o.store.readJson<Record<string, StateEntry>>(stateName)) ?? {};
  const voiceId = ttsVoiceId(o.tts);
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
    if (st?.status === 'ok' && onDisk) continue;
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

    try {
      const heard = (await o.stt.transcribe({ bytes: Buffer.from(wav!), mimetype: 'audio/wav' })).text;
      verified++;
      const ok = matchesVerbatim(text, heard);
      state[key] = { ...state[key], text, status: ok ? 'ok' : 'rejected', heard };
      log(`${ok ? 'ĐẠT ' : 'LOẠI'} “${text}”${ok ? '' : ` — nghe ra “${heard}”`}`);
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
  const counts = { ok: 0, rejected: 0, unverified: 0, missing: 0 };
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
  const pack: AudioPack = { version: 1, pack: o.pack, dialect: o.dialect, model: o.tts.model, voice: o.tts.voice, items };
  await o.store.writeJson(`packs/${o.pack}-${o.dialect}.json`, pack);

  return { total: o.texts.length, ...counts, synthesized, verified, stoppedBy, rejectedList };
}
