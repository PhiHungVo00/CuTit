import { FastifyPluginAsync } from 'fastify';
import { VoiceTurnRequestSchema } from '@vietlearning/contracts';
import { RequestPipeline } from '../pipeline/RequestPipeline.js';
import { LlmAdapter } from '../adapters/LlmAdapter.js';

/**
 * GoF Facade Pattern (7)
 * Gom chuỗi gọi STT, LLM Streaming và phát TTS sớm thành một endpoint /v1/chat/turn duy nhất
 * Hỗ trợ đồng thời cả JSON thông thường và Server-Sent Events (SSE) theo Mục 4.2 TDD
 */
export const chatRoutes: FastifyPluginAsync = async (server) => {
  const pipeline = new RequestPipeline();
  const llmAdapter = new LlmAdapter();

  server.post('/chat/turn', async (request: any, reply) => {
    const parse = VoiceTurnRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: parse.error.issues });
    }

    // 1. Chạy qua chuỗi trách nhiệm kiểm tra hạn mức & bảo mật (Chain of Responsibility)
    await pipeline.process(request);

    const { sessionId, userText, targetDialect, learnerLevel } = parse.data;
    const dialect = targetDialect || 'north';

    // 2. Gọi Adapter LLM tạo nội dung phản hồi có cấu trúc JSON
    const turnResult = await llmAdapter.generateTurn({
      sessionId,
      userText,
      targetDialect: dialect,
      learnerLevel
    });

    // 3. Chuẩn bị Audio URL cho giọng đọc phản hồi của Cu Tít
    const host = request.headers.host ? `http://${request.headers.host}` : '';
    const audioUrl = `${host}/api/speech/stream?text=${encodeURIComponent(turnResult.agentReply)}&dialect=${dialect}`;

    const finalResponse = {
      turnId: turnResult.turnId,
      transcript: turnResult.transcript,
      correctedText: turnResult.correctedText,
      explanation: turnResult.explanation,
      agentReply: turnResult.agentReply,
      audioUrl,
      toneAccuracy: turnResult.toneAccuracy,
      uiBlocks: turnResult.uiBlocks
    };

    // Kiểm tra xem Client có yêu cầu luồng Server-Sent Events (SSE) hay không
    const isSSE =
      request.headers.accept?.includes('text/event-stream') ||
      request.query?.stream === 'true' ||
      request.body?.stream === true;

    if (isSSE) {
      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.setHeader('Access-Control-Allow-Origin', '*');

      // Tách lời thoại thành các cụm từ để giả lập streaming token tự nhiên
      const words = turnResult.agentReply.split(' ');
      for (let i = 0; i < words.length; i++) {
        const token = (i === 0 ? '' : ' ') + words[i];
        reply.raw.write(`event: token\ndata: ${JSON.stringify({ token })}\n\n`);
        await new Promise((r) => setTimeout(r, 60));
      }

      // Phát các khối Agent UI qua SSE
      for (const block of turnResult.uiBlocks) {
        reply.raw.write(`event: block\ndata: ${JSON.stringify(block)}\n\n`);
        await new Promise((r) => setTimeout(r, 80));
      }

      // Phát sự kiện hoàn tất lượt thoại
      reply.raw.write(`event: done\ndata: ${JSON.stringify(finalResponse)}\n\n`);
      reply.raw.end();
      return;
    }

    return finalResponse;
  });
};
