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

  // GET /v1/speech/stream & /api/speech/stream (Direct MP3 audio stream)
  server.get('/speech/stream', async (req: any, reply) => {
    const text = req.query.text || 'Xin chào';
    const dialect = req.query.dialect || 'north';
    const encoded = encodeURIComponent(text);
    const googleTTSUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encoded}`;

    try {
      const response = await fetch(googleTTSUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      if (!response.ok) {
        reply.status(response.status).send({ error: 'Upstream TTS service error' });
        return;
      }

      const buffer = await response.arrayBuffer();
      reply
        .header('Content-Type', 'audio/mpeg')
        .header('Cache-Control', 'public, max-age=86400')
        .header('Accept-Ranges', 'bytes')
        .header('X-Dialect', dialect)
        .send(Buffer.from(buffer));
    } catch (err: any) {
      server.log.error(err);
      reply.status(500).send({ error: 'Failed to synthesize speech audio' });
    }
  });

  // POST /v1/speech/synthesize & POST /speech/tts (Task requirement alias)
  const handleSynthesize = async (req: any, reply: any) => {
    const text = req.body?.text || 'Xin chào';
    const dialect = req.body?.dialect || 'north';
    const host = req.headers.host ? `http://${req.headers.host}` : '';
    const streamUrl = `${host}/api/speech/stream?text=${encodeURIComponent(text)}&dialect=${dialect}`;
    return {
      audioUrl: streamUrl,
      durationMs: 1500,
      cached: true
    };
  };

  server.post('/speech/synthesize', handleSynthesize);
  server.post('/speech/tts', handleSynthesize);

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
