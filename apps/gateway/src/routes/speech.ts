import { FastifyPluginAsync } from 'fastify';
import { SynthesizeRequestSchema } from '@vietlearning/contracts';

export const speechRoutes: FastifyPluginAsync = async (server) => {
  // POST /v1/speech/transcribe
  server.post('/speech/transcribe', async (req, reply) => {
    return {
      text: 'Xin chào bạn',
      confidence: 0.96,
      words: [{ w: 'Xin', start: 0.1, end: 0.3 }, { w: 'chào', start: 0.35, end: 0.6 }, { w: 'bạn', start: 0.65, end: 0.9 }]
    };
  });

  // POST /v1/speech/synthesize
  server.post('/speech/synthesize', async (req, reply) => {
    const parse = SynthesizeRequestSchema.safeParse(req.body);
    return {
      audioUrl: 'https://audio.vietlearning.app/sample.mp3',
      durationMs: 1450,
      cached: true
    };
  });

  // GET /v1/speech/voices
  server.get('/speech/voices', async (req, reply) => {
    return [
      { id: 'vi-VN-Standard-A', name: 'Giọng Nữ Bắc (Hà Nội)', dialect: 'north' },
      { id: 'vi-VN-Standard-B', name: 'Giọng Nam Bắc (Hà Nội)', dialect: 'north' },
      { id: 'vi-VN-Standard-C', name: 'Giọng Nữ Nam (Sài Gòn)', dialect: 'south' },
      { id: 'vi-VN-Standard-D', name: 'Giọng Nữ Trung (Huế)', dialect: 'central' }
    ];
  });

  // POST /v1/speech/assess (A3 + A2)
  server.post('/speech/assess', async (req, reply) => {
    return {
      transcript: 'Xin chào',
      diff: [],
      score: 92,
      hints: ['Phát âm thanh huyền ở từ "chào" rất chuẩn xác!']
    };
  });
};
