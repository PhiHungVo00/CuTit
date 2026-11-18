import { createHash } from 'node:crypto';
import type { TtsProvider } from '../providers/tts.js';
import type { FileAudioStore } from '../services/tts/audioStore.js';

/**
 * GoF Proxy Pattern (11)
 * Kiểm tra bộ nhớ đệm Cloudflare R2 / S3 trước khi gọi API TTS trả phí.
 *
 * Khóa cache = sha256 của toàn bộ tham số ảnh hưởng tới âm thanh (văn bản đã chuẩn hóa NFC,
 * giọng, tốc độ, phương ngữ). Bản cũ chỉ lấy 4 byte đầu của văn bản nên các câu cùng mở đầu
 * như "Chào bạn…" và "Chào em…" bị trùng một file.
 */
export interface TTSParams {
  text: string;
  voiceId: string;
  speed: number;
  dialect: 'north' | 'central' | 'south';
}

export type TTSSynthesizer = (params: TTSParams, key: string) => Promise<string>;

export function ttsCacheKey(p: TTSParams): string {
  const canonical = [p.text.normalize('NFC').trim(), p.voiceId, p.speed.toFixed(2), p.dialect].join('\u0000');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export class TTSCacheProxy {
  private cache = new Map<string, string>();

  /**
   * @param providerConfigured có nhà cung cấp tổng hợp MỚI hay không (mặc định = có synthesize). GĐ2: bộ tổng hợp
   * ghi tệp luôn tồn tại (để phục vụ tệp dựng sẵn) nhưng chỉ "configured" khi có nhà cung cấp — M1/M7 dựa vào cờ này
   * để không gọi TTS cho mỗi lượt chat khi chưa bật.
   */
  constructor(
    private synthesize?: TTSSynthesizer,
    private readonly providerConfigured: boolean = Boolean(synthesize)
  ) {}

  get configured(): boolean {
    return this.providerConfigured;
  }

  async getAudio(params: TTSParams): Promise<{ audioUrl: string; cached: boolean }> {
    const key = ttsCacheKey(params);
    const hit = this.cache.get(key);
    if (hit) return { audioUrl: hit, cached: true };

    if (!this.synthesize) {
      throw Object.assign(new Error('Chưa cấu hình nhà cung cấp TTS'), {
        statusCode: 503,
        code: 'tts_provider_not_configured'
      });
    }
    const audioUrl = await this.synthesize(params, key);
    this.cache.set(key, audioUrl);
    return { audioUrl, cached: false };
  }
}

/**
 * Bộ tổng hợp ghi tệp (GĐ2): tệp đã có trên đĩa (dựng sẵn) => trả ngay, không gọi nhà cung cấp; chưa có => gọi
 * `tts.synthesize`, lưu `<khóa>.wav`. Trả đường dẫn tương đối `/audio/<khóa>.wav` (route thêm gốc URL).
 * Khóa tính với voiceId = model/giọng/phiên bản prompt của nhà cung cấp (xem ttsVoiceId), nên route phải
 * truyền vào params đã thay voiceId.
 */
export function fileSynthesizer(store: FileAudioStore, provider: TtsProvider | null): TTSSynthesizer {
  return async (params, key) => {
    if (!(await store.has(key))) {
      if (!provider) {
        throw Object.assign(new Error('Chưa cấu hình nhà cung cấp TTS'), { statusCode: 503, code: 'tts_provider_not_configured' });
      }
      const { wav } = await provider.synthesize({ text: params.text, dialect: params.dialect });
      await store.write(key, wav);
    }
    return `/audio/${key}.wav`;
  };
}
