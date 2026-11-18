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

const MB = 1024 * 1024;

export const speechRoutes: FastifyPluginAsync<RouteDeps> = async (server, { pipeline, ttsCache, config, stt }) => {
  const audioLimit = { bodyLimit: config.AUDIO_BODY_LIMIT_MB * MB };

  // POST /v1/speech/transcribe (multipart: file "audio"). Có AI => chép lời thật (không có mốc thời gian từng từ);
  // không có AI => câu mẫu, mock: true
  server.post('/speech/transcribe', audioLimit, async (request) => {
    const upload = await readAudioUpload(request);
    await pipeline.consume(request, 'stt', Math.max(1, Math.ceil(upload.durationSec)));
    if (stt) {
      const { text, confidence } = await stt.transcribe(upload);
      return respond(TranscribeResponseSchema, { text, confidence, words: [], mock: false });
    }
    return respond(TranscribeResponseSchema, {
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
    const { audioUrl, cached } = await ttsCache.getAudio(body);
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
    await pipeline.consume(request, 'stt', Math.max(1, Math.ceil(upload.durationSec)));
    const wav = upload.mimetype.includes('wav') || upload.mimetype === 'audio/wave' ? decodeWavPcm(new Uint8Array(upload.bytes.buffer, upload.bytes.byteOffset, upload.bytes.byteLength)) : null;
    const transcript = stt ? (await stt.transcribe({ bytes: upload.bytes, mimetype: upload.mimetype })).text : null;
    return respond(
      AssessResponseSchema,
      assessPronunciation({ expectedText, transcript, pcm: wav?.pcm ?? null, sampleRate: wav?.sampleRate ?? 16000 })
    );
  });
};
