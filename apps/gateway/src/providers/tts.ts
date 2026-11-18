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
  /** giọng riêng theo miền (nhà cung cấp có giọng mẫu từng miền); không có => dùng `voice` cho mọi miền */
  voiceFor?(dialect: Dialect): string;
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
export const ttsVoiceId = (p: Pick<TtsProvider, 'model' | 'voice' | 'promptVersion' | 'voiceFor'>, dialect?: Dialect) =>
  `${p.model}/${(dialect && p.voiceFor?.(dialect)) || p.voice}/${p.promptVersion}`;

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
 * TTS qua máy chủ kiểu OpenAI `POST {base}/audio/speech` — vd. `tools/tts-local` (VieNeu-TTS chạy trên máy, Apache-2.0).
 * Giọng do cấu hình chọn theo miền (giọng mẫu đã là giọng bản xứ từng miền), không cần prompt chỉ dẫn.
 */
export class OpenAiCompatTtsProvider implements TtsProvider {
  readonly name = 'openai-compatible-tts';
  /** đổi tham số lấy mẫu/khử nhiễu ở máy chủ local => tăng số này để không dùng lại tệp cũ */
  readonly promptVersion = 'oai-v1';

  constructor(
    private readonly baseUrl: string,
    readonly model: string,
    private readonly voices: Record<Dialect, string>,
    private readonly timeoutMs = 120_000,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  get voice(): string {
    return `${this.voices.north}|${this.voices.central}|${this.voices.south}`;
  }

  voiceFor(dialect: Dialect): string {
    return this.voices[dialect];
  }

  async synthesize({ text, dialect }: { text: string; dialect: Dialect }): Promise<{ wav: Uint8Array }> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, '')}/audio/speech`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, input: text.normalize('NFC').trim(), voice: this.voices[dialect], response_format: 'wav' }),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch {
      throw new GatewayError(502, 'tts_unavailable', 'Không kết nối được dịch vụ đọc');
    }
    if (res.status === 429) throw new GatewayError(429, 'tts_quota_exhausted', 'Hết hạn mức đọc');
    if (!res.ok) throw new GatewayError(502, 'tts_unavailable', `Dịch vụ đọc lỗi (${res.status})`);
    const wav = new Uint8Array(await res.arrayBuffer());
    // 'RIFF' .... 'WAVE'
    if (wav.length <= 44 || String.fromCharCode(...wav.slice(0, 4)) !== 'RIFF' || String.fromCharCode(...wav.slice(8, 12)) !== 'WAVE') {
      throw new GatewayError(502, 'tts_bad_output', 'Dịch vụ đọc không trả WAV');
    }
    return { wav };
  }
}

/**
 * TTS chỉ bật khi cấu hình RÕ RÀNG `TTS_PROVIDER=gemini` (không suy ra từ việc có khóa): máy dev có khóa Gemini,
 * nếu tự bật thì mọi lần gọi /speech/synthesize sẽ tiêu hạn mức 10 lần/ngày.
 */
export function createTtsProvider(config: GatewayConfig): TtsProvider | null {
  if (config.TTS_PROVIDER === 'openai-compatible') {
    return new OpenAiCompatTtsProvider(config.TTS_BASE_URL, config.TTS_MODEL, {
      north: config.TTS_VOICE_NORTH,
      central: config.TTS_VOICE_CENTRAL,
      south: config.TTS_VOICE_SOUTH
    });
  }
  if (config.TTS_PROVIDER !== 'gemini' || !config.GEMINI_API_KEY) return null;
  return new GeminiTtsProvider(config.GEMINI_API_KEY, config.GEMINI_TTS_MODEL, config.GEMINI_TTS_VOICE);
}
