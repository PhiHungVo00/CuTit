import { randomUUID } from 'node:crypto';
import { FastifyPluginAsync } from 'fastify';
import { VoiceTurnRequestSchema, VoiceTurnResponseSchema } from '@vietlearning/contracts';
import type { RouteDeps } from '../app.js';
import { parseOr400, respond } from '../lib/validate.js';

const MB = 1024 * 1024;

/**
 * GoF Facade Pattern (7)
 * Gom chuỗi gọi STT, LLM Streaming và phát TTS sớm thành một endpoint /v1/chat/turn duy nhất.
 * Hiện vẫn là MOCK: chưa nối Provider thật.
 */
export const chatRoutes: FastifyPluginAsync<RouteDeps> = async (server, { pipeline, ttsCache, config }) => {
  server.post('/chat/turn', { bodyLimit: config.AUDIO_BODY_LIMIT_MB * MB }, async (request, reply) => {
    const body = parseOr400(VoiceTurnRequestSchema, request.body, reply);
    if (!body) return reply;

    // Ước lượng token cho LLM (thay bằng số token thật từ Provider khi nối API)
    const estimatedTokens = Math.ceil((body.userText?.length ?? 200) / 3) + 300;
    await pipeline.consume(request, 'llm', estimatedTokens);

    const reply_text = 'Chào bạn, mình là Bé Cu Tít!';
    let audioUrl: string | undefined;
    if (ttsCache.configured) {
      await pipeline.consume(request, 'tts', reply_text.length);
      ({ audioUrl } = await ttsCache.getAudio({
        text: reply_text,
        voiceId: 'vi-VN-Standard-A',
        speed: 1,
        dialect: body.targetDialect
      }));
    }

    return respond(VoiceTurnResponseSchema, {
      turnId: randomUUID(),
      transcript: body.userText ?? 'Xin chào Cu Tít',
      correctedText: 'Xin chào Cu Tít!',
      explanation: 'Câu chào hỏi đã rất chính xác!',
      audioUrl,
      uiBlocks: [
        {
          id: 'block-1',
          type: 'culture_pill',
          title: 'Văn hóa chào hỏi',
          payload: { tip: 'Người Việt Nam thường khoanh tay chào người lớn tuổi.' }
        }
      ]
    });
  });
};
