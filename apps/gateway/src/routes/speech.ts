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

const MB = 1024 * 1024;

export const speechRoutes: FastifyPluginAsync<RouteDeps> = async (server, { pipeline, ttsCache, config }) => {
  const audioLimit = { bodyLimit: config.AUDIO_BODY_LIMIT_MB * MB };

  // POST /v1/speech/transcribe (multipart: file "audio") — STT còn MOCK, nhưng đầu vào/quota là thật
  server.post('/speech/transcribe', audioLimit, async (request) => {
    const upload = await readAudioUpload(request);
    await pipeline.consume(request, 'stt', Math.max(1, Math.ceil(upload.durationSec)));
    return respond(TranscribeResponseSchema, {
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

  // POST /v1/speech/assess (A3 + A2) (multipart: file "audio" + expectedText/targetTone) — chấm điểm còn MOCK
  server.post('/speech/assess', audioLimit, async (request) => {
    const upload = await readAudioUpload(request);
    await pipeline.consume(request, 'stt', Math.max(1, Math.ceil(upload.durationSec)));
    return respond(AssessResponseSchema, {
      transcript: 'Xin chào',
      diff: [],
      score: 92,
      hints: ['Phát âm thanh huyền ở từ "chào" rất chuẩn xác!']
    });
  });
};
