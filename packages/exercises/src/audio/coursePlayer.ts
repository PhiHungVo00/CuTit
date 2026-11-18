/**
 * Phát âm thanh khóa học (GĐ2, D9): ưu tiên tệp dựng sẵn theo miền (giọng Bắc/Trung/Nam), thiếu thì dùng TTS
 * của máy (một giọng chung). Gói tải theo unit vào Cache Storage => học offline vẫn nghe được.
 *   manifest: <gateway>/audio/packs/<gói>-<miền>.json   tệp: <gateway>/audio/<sha256>.wav
 * Không chặn bài học: mọi lỗi mạng/cache đều im lặng và rơi về TTS của máy.
 */
import { getDeviceSpeech } from '@vietlearning/native';
import { learnerStore, speechRate } from '@vietlearning/state';

export type Dialect = 'north' | 'central' | 'south';
export const AUDIO_CACHE = 'becutit-audio-v1';
/** Nút 🐢 đọc chậm (D9 mục 6): âm thanh dựng sẵn đọc ở tốc độ tự nhiên, hơi nhanh với người mới */
export const SLOW_RATE = 0.75;

export interface PlayOptions {
  slow?: boolean;
}

interface Pack {
  dialect: Dialect;
  items: Record<string, string>;
}

const packs = new Map<string, Pack>();
const KEY_RE = /^[a-f0-9]{64}$/;

async function baseUrl(): Promise<string> {
  const { gatewayBaseUrl } = await import('@vietlearning/api-client');
  return gatewayBaseUrl();
}

const openCache = async (): Promise<Cache | null> => {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(AUDIO_CACHE);
  } catch {
    return null;
  }
};

/** Kiểm tra nhẹ (không kéo Zod vào chunk bài học): chỉ nhận khóa sha256 hợp lệ */
function parsePack(json: unknown, dialect: Dialect): Pack | null {
  const items = (json as { items?: unknown } | null)?.items;
  if (!items || typeof items !== 'object') return null;
  const clean: Record<string, string> = {};
  for (const [text, key] of Object.entries(items as Record<string, unknown>)) {
    if (typeof key === 'string' && KEY_RE.test(key)) clean[text.normalize('NFC').trim()] = key;
  }
  return { dialect, items: clean };
}

/**
 * Tải gói của một unit cho một miền (mạng trước, mất mạng thì đọc bản đã lưu) rồi lưu các tệp chưa có.
 * Trả số tệp sẵn sàng offline. An toàn khi gọi nhiều lần.
 */
export async function prefetchPack(pack: string, dialect: Dialect): Promise<number> {
  try {
    const url = `${await baseUrl()}/audio/packs/${pack}-${dialect}.json`;
    const cache = await openCache();
    let res: Response | undefined;
    try {
      res = await fetch(url);
      if (res.ok) await cache?.put(url, res.clone());
      else res = undefined;
    } catch {
      res = (await cache?.match(url)) ?? undefined;
    }
    if (!res) return 0;
    const p = parsePack(await res.json(), dialect);
    if (!p) return 0;
    packs.set(`${pack}-${dialect}`, p);
    if (!cache) return 0;
    const base = await baseUrl();
    let ready = 0;
    for (const key of new Set(Object.values(p.items))) {
      const fileUrl = `${base}/audio/${key}.wav`;
      if (await cache.match(fileUrl)) ready++;
      else
        await cache
          .add(fileUrl)
          .then(() => ready++)
          .catch(() => undefined);
    }
    return ready;
  } catch {
    return 0;
  }
}

/** Khóa tệp dựng sẵn của `text` trong các gói đã nạp cho miền `dialect` */
export function findAudioKey(text: string, dialect: Dialect): string | undefined {
  const t = text.normalize('NFC').trim();
  for (const p of packs.values()) if (p.dialect === dialect && p.items[t]) return p.items[t];
  return undefined;
}

let current: HTMLAudioElement | null = null;

async function playFile(key: string, rate: number): Promise<boolean> {
  try {
    const url = `${await baseUrl()}/audio/${key}.wav`;
    const cached = await (await openCache())?.match(url);
    const src = cached ? URL.createObjectURL(await cached.blob()) : url;
    current?.pause();
    const audio = new Audio(src);
    // trình duyệt giữ cao độ khi đổi tốc độ (mặc định đã bật; đặt rõ để thanh điệu không bị méo)
    audio.preservesPitch = true;
    audio.playbackRate = rate;
    current = audio;
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error('audio'));
      audio.play().catch(reject);
    });
    if (cached) URL.revokeObjectURL(src);
    return true;
  } catch {
    return false;
  }
}

/** Đọc một từ/câu của khóa học theo miền đang chọn (tệp dựng sẵn) hoặc bằng TTS của máy. */
export async function playText(text: string, dialect: Dialect = learnerStore.getState().preferences.dialect, opts: PlayOptions = {}): Promise<void> {
  const slow = opts.slow ? SLOW_RATE : 1;
  const key = findAudioKey(text, dialect);
  if (key && (await playFile(key, slow))) return;
  await getDeviceSpeech()
    .speak(text, { rate: speechRate(0.85 * slow) })
    .catch(() => undefined);
}

/** Dừng âm thanh đang phát (rời bài truyện giữa chừng) */
export function stopPlayback(): void {
  current?.pause();
  current = null;
  void getDeviceSpeech()
    .stop()
    .catch(() => undefined);
}

/** chỉ cho test */
export function _resetPacks(): void {
  packs.clear();
}
