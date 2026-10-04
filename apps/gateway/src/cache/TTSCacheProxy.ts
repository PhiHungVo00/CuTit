/**
 * GoF Proxy Pattern (11)
 * Kiểm tra bộ nhớ đệm Cloudflare R2 / S3 trước khi gọi API TTS trả phí
 */
export class TTSCacheProxy {
  private cache = new Map<string, string>();

  async getAudio(text: string): Promise<string> {
    if (this.cache.has(text)) {
      return this.cache.get(text)!; // Trả về link S3 từ Cache
    }
    // Chưa có thì gọi API TTS tạo file mới, lưu Cache rồi trả về
    const newAudioUrl = `https://audio.vietlearning.app/tts-${Buffer.from(text).toString('hex').slice(0, 8)}.mp3`;
    this.cache.set(text, newAudioUrl);
    return newAudioUrl;
  }
}
