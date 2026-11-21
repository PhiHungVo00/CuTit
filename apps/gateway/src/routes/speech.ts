import { FastifyPluginAsync } from 'fastify';
import {
  AssessResponseSchema,
  SynthesizeRequestSchema,
  SynthesizeResponseSchema,
  TranscribeResponseSchema,
  VoiceListResponseSchema
} from '@vietlearning/contracts';
import type { RouteDeps } from '../app.js';
import { parseOr400, respond } from '../lib/validate.js';
import { readAudioUpload } from '../lib/audioUpload.js';
import { decodeWavPcm } from '@vietlearning/audio-dsp';
import { GatewayError } from '../pipeline/RequestPipeline.js';
import { assessPronunciation } from '../services/assessment/assess.js';
import { ttsVoiceId } from '../providers/tts.js';

const MB = 1024 * 1024;

export const speechRoutes: FastifyPluginAsync<RouteDeps> = async (server, { pipeline, ttsCache, config, stt, tts }) => {
  const audioLimit = { bodyLimit: config.AUDIO_BODY_LIMIT_MB * MB };

  // POST /v1/speech/transcribe (multipart: file "audio"). Có AI => chép lời thật (không có mốc thời gian từng từ);
  // không có AI => câu mẫu, mock: true
  server.post('/speech/transcribe', audioLimit, async (request, reply) => {
    const upload = await readAudioUpload(request);
    // STT lỗi / hết chuỗi dự phòng => hoàn lại số giây đã trừ (không trừ khi AI không trả lời được)
    const seconds = Math.max(1, Math.ceil(upload.durationSec));
    if (stt) {
      const { text, confidence, provider } = await pipeline.run(request, [['stt', seconds]], () => stt.transcribe(upload));
      if (provider) reply.header('x-ai-provider', provider);
      return respond(TranscribeResponseSchema, { text, confidence, words: [], mock: false, remaining: await pipeline.remaining(request) });
    }
    await pipeline.consume(request, 'stt', seconds);
    return respond(TranscribeResponseSchema, {
      remaining: await pipeline.remaining(request),
      mock: true,
      text: 'Xin chào bạn',
      confidence: 0.96,
      words: [
        { w: 'Xin', start: 0.1, end: 0.3 },
        { w: 'chào', start: 0.35, end: 0.6 },
        { w: 'bạn', start: 0.65, end: 0.9 }
      ]
    });
  });

  // POST /v1/speech/synthesize
  server.post('/speech/synthesize', async (request, reply) => {
    const body = parseOr400(SynthesizeRequestSchema, request.body, reply);
    if (!body) return reply;

    await pipeline.consume(request, 'tts', body.text.length);
    // Chưa có Provider => TTSCacheProxy ném 503 tts_provider_not_configured, client tự xử lý,
    // thay vì trả về một URL âm thanh giả không tồn tại như trước.
    // Có nhà cung cấp TTS (GĐ2): giọng do nhà cung cấp quyết định => khóa cache theo model/giọng/prompt, để trùng
    // với tệp script đã dựng sẵn (tệp có sẵn thì không gọi nhà cung cấp, không tốn hạn mức).
    const params = tts ? { ...body, voiceId: ttsVoiceId(tts, body.dialect), speed: 1 } : body;
    const { audioUrl: url, cached } = await ttsCache.getAudio(params);
    const base = config.PUBLIC_BASE_URL ?? `${request.protocol}://${request.headers.host ?? 'localhost'}`;
    const audioUrl = url.startsWith('/') ? new URL(url, base).toString() : url;
    return respond(SynthesizeResponseSchema, {
      audioUrl,
      durationMs: Math.max(500, body.text.length * 70),
      cached
    });
  });

  // GET /v1/speech/voices
  server.get('/speech/voices', async () =>
    respond(VoiceListResponseSchema, [
      { id: 'vi-VN-Standard-A', name: 'Giọng Nữ Bắc (Hà Nội)', dialect: 'north' },
      { id: 'vi-VN-Standard-B', name: 'Giọng Nam Bắc (Hà Nội)', dialect: 'north' },
      { id: 'vi-VN-Standard-C', name: 'Giọng Nữ Nam (Sài Gòn)', dialect: 'south' },
      { id: 'vi-VN-Standard-D', name: 'Giọng Nữ Trung (Huế)', dialect: 'central' }
    ])
  );

  // POST /v1/speech/assess (A3 + A2) — multipart: file "audio" + expectedText (bắt buộc).
  // STT chép lời KHÔNG được biết câu mẫu (tránh "nghe theo đáp án"); so khớp âm tiết + A2 làm ở Gateway.
  server.post('/speech/assess', audioLimit, async (request) => {
    const upload = await readAudioUpload(request);
    const expectedText = upload.fields.expectedText;
    if (!expectedText) throw new GatewayError(400, 'missing_expected_text', 'Thiếu trường expectedText (câu cần đọc)');
    const seconds = Math.max(1, Math.ceil(upload.durationSec));
    const wav = upload.mimetype.includes('wav') || upload.mimetype === 'audio/wave' ? decodeWavPcm(new Uint8Array(upload.bytes.buffer, upload.bytes.byteOffset, upload.bytes.byteLength)) : null;
    let transcript: string | null = null;
    if (stt) transcript = (await pipeline.run(request, [['stt', seconds]], () => stt.transcribe({ bytes: upload.bytes, mimetype: upload.mimetype }))).text;
    else await pipeline.consume(request, 'stt', seconds);
    return respond(AssessResponseSchema, {
      ...assessPronunciation({ expectedText, transcript, pcm: wav?.pcm ?? null, sampleRate: wav?.sampleRate ?? 16000 }),
      remaining: await pipeline.remaining(request)
    });
  });
};
