import { createHash } from 'node:crypto';

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

  constructor(private synthesize?: TTSSynthesizer) {}

  get configured(): boolean {
    return Boolean(this.synthesize);
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
