import { FastifyPluginAsync } from 'fastify';
import { VoiceTurnRequestSchema } from '@vietlearning/contracts';
import { RequestPipeline } from '../pipeline/RequestPipeline.js';
import { TTSCacheProxy } from '../cache/TTSCacheProxy.js';

/**
 * GoF Facade Pattern (7)
 * Gom chuỗi gọi STT, LLM Streaming và phát TTS sớm thành một endpoint /v1/chat/turn duy nhất
 */
export const chatRoutes: FastifyPluginAsync = async (server) => {
  const pipeline = new RequestPipeline();
  const ttsCache = new TTSCacheProxy();

  server.post('/chat/turn', async (request, reply) => {
    const parse = VoiceTurnRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: parse.error.issues });
    }

    // 1. Chạy qua chuỗi trách nhiệm kiểm tra hạn mức & bảo mật (Chain of Responsibility)
    await pipeline.process(request);

    // 2. Facade xử lý: Trả về kết quả tổng hợp
    const mockAudioUrl = await ttsCache.getAudio('Chào bạn, mình là Bé Cu Tít!');

    return {
      turnId: 'mock-turn-' + Date.now(),
      transcript: 'Xin chào Cu Tít',
      correctedText: 'Xin chào Cu Tít!',
      explanation: 'Câu chào hỏi đã rất chính xác!',
      audioUrl: mockAudioUrl,
      uiBlocks: [
        {
          id: 'block-1',
          type: 'culture_pill',
          title: 'Văn hóa chào hỏi',
          payload: { tip: 'Người Việt Nam thường khoanh tay chào người lớn tuổi.' }
        }
      ]
    };
  });
};
