import { pcm16ToWav } from '@vietlearning/audio-dsp';
import type { GatewayConfig } from '../config.js';
import { GatewayError } from '../pipeline/RequestPipeline.js';

/**
 * Năng lực "đọc văn bản" trừu tượng (Nguyên tắc 4): code gọi `tts.synthesize`, không gọi tên hãng.
 * Giọng theo miền (D9): Gemini TTS với prompt dạng "director's notes" — chỉ dẫn giọng TÁCH khỏi phần lời
 * (TRANSCRIPT), yêu cầu đọc đúng nguyên văn. Ghép chỉ dẫn vào cùng câu thì model đọc luôn chỉ dẫn và tự đổi từ;
 * `systemInstruction` bị model TTS từ chối (400) — xem kế hoạch tổng mục 9 (D9).
 */
export type Dialect = 'north' | 'central' | 'south';

export interface TtsProvider {
  readonly name: string;
  readonly model: string;
  readonly voice: string;
  /** đổi prompt => đổi phiên bản => khóa cache mới (không dùng lại âm thanh của prompt cũ) */
  readonly promptVersion: string;
  synthesize(req: { text: string; dialect: Dialect }): Promise<{ wav: Uint8Array }>;
}

export const TTS_PROMPT_VERSION = 'd9-v1';

const ACCENT: Record<Dialect, string> = {
  north: 'Northern Vietnamese (Hanoi)',
  central: 'Central Vietnamese (Hue)',
  south: 'Southern Vietnamese (Saigon)'
};

/** Prompt director's notes: hồ sơ giọng + chỉ dẫn, rồi TRANSCRIPT riêng ở cuối. */
export function directorPrompt(text: string, dialect: Dialect): string {
  return [
    '# AUDIO PROFILE',
    'A friendly Vietnamese language teacher.',
    "## DIRECTOR'S NOTES",
    `Accent: native ${ACCENT[dialect]} accent, natural pronunciation and tones.`,
    'Pacing: moderate, clear.',
    'Read ONLY the transcript, word for word. Do not add or change any words.',
    '## TRANSCRIPT',
    text.normalize('NFC').trim()
  ].join('\n');
}

/** Khóa cache gồm model + giọng + phiên bản prompt (đổi bất kỳ cái nào => tệp mới) */
export const ttsVoiceId = (p: Pick<TtsProvider, 'model' | 'voice' | 'promptVersion'>) => `${p.model}/${p.voice}/${p.promptVersion}`;

interface GeminiAudioResponse {
  candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
}

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiTtsProvider implements TtsProvider {
  readonly name = 'gemini-tts';
  readonly promptVersion = TTS_PROMPT_VERSION;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    readonly voice: string,
    private readonly timeoutMs = 60_000,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async synthesize({ text, dialect }: { text: string; dialect: Dialect }): Promise<{ wav: Uint8Array }> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${ENDPOINT}/${this.model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: directorPrompt(text, dialect) }] }],
          generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voice } } } }
        }),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch {
      throw new GatewayError(502, 'tts_unavailable', 'Không kết nối được dịch vụ đọc');
    }
    // 429 = hết hạn mức (gói miễn phí: 10 lần/ngày/model) => script dựng sẵn phải dừng êm
    if (res.status === 429) throw new GatewayError(429, 'tts_quota_exhausted', 'Hết hạn mức đọc trong ngày');
    if (!res.ok) throw new GatewayError(502, 'tts_unavailable', `Dịch vụ đọc lỗi (${res.status})`);

    const data = (await res.json()) as GeminiAudioResponse;
    const inline = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!inline?.data) throw new GatewayError(502, 'tts_bad_output', 'Dịch vụ đọc không trả âm thanh');
    const bytes = Uint8Array.from(Buffer.from(inline.data, 'base64'));
    const mime = (inline.mimeType ?? '').toLowerCase();
    if (mime.startsWith('audio/wav') || mime.startsWith('audio/x-wav')) return { wav: bytes };
    // PCM thô: audio/L16;codec=pcm;rate=24000 (mặc định 24 kHz nếu thiếu)
    if (mime.startsWith('audio/l16') || mime.includes('pcm')) {
      const rate = Number(/rate=(\d+)/.exec(mime)?.[1]) || 24000;
      return { wav: pcm16ToWav(bytes, rate) };
    }
    throw new GatewayError(502, 'tts_bad_output', `Định dạng âm thanh lạ: ${mime || 'không rõ'}`);
  }
}

/**
 * TTS chỉ bật khi cấu hình RÕ RÀNG `TTS_PROVIDER=gemini` (không suy ra từ việc có khóa): máy dev có khóa Gemini,
 * nếu tự bật thì mọi lần gọi /speech/synthesize sẽ tiêu hạn mức 10 lần/ngày.
 */
export function createTtsProvider(config: GatewayConfig): TtsProvider | null {
  if (config.TTS_PROVIDER !== 'gemini' || !config.GEMINI_API_KEY) return null;
  return new GeminiTtsProvider(config.GEMINI_API_KEY, config.GEMINI_TTS_MODEL, config.GEMINI_TTS_VOICE);
}
