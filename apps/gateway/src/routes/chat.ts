import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { FastifyPluginAsync } from 'fastify';
import { ChatEventSchema, VoiceTurnRequestSchema, VoiceTurnResponseSchema, type ChatEvent } from '@vietlearning/contracts';
import { ROLEPLAY_SCENARIOS } from '@vietlearning/content';
import type { RouteDeps } from '../app.js';
import { parseOr400, respond } from '../lib/validate.js';

const MB = 1024 * 1024;

/** Xác thực từng sự kiện trước khi gửi (Nguyên tắc 6), rồi đóng khung SSE — mọi sự kiện kết thúc bằng \n\n */
function sse(event: ChatEvent): string {
  return `data: ${JSON.stringify(ChatEventSchema.parse(event))}\n\n`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GoF Facade Pattern (7)
 * Gom chuỗi gọi STT, LLM Streaming và phát TTS sớm thành một endpoint /v1/chat/turn duy nhất.
 * LLM qua năng lực trừu tượng (services/chat/tutor.ts): có GEMINI_API_KEY => AI thật (mock: false);
 * không có khóa hoặc AI lỗi => gia sư giả lập (mockTutor.ts), lượt đó gắn mock: true.
 *
 * - Accept: text/event-stream => luồng SSE (transcript → token* → correction? → blocks? → done)
 * - Khác => JSON một lần (giữ tương thích bản cũ)
 * Kiểm tra request và trừ quota TRƯỚC khi mở luồng, để lỗi 400/429 vẫn là JSON bình thường.
 */
export const chatRoutes: FastifyPluginAsync<RouteDeps> = async (server, { pipeline, ttsCache, config, tutor }) => {
  server.post('/chat/turn', { bodyLimit: config.AUDIO_BODY_LIMIT_MB * MB }, async (request, reply) => {
    const body = parseOr400(VoiceTurnRequestSchema, request.body, reply);
    if (!body) return reply;
    const scenario = body.scenarioId ? ROLEPLAY_SCENARIOS.find((s) => s.id === body.scenarioId) : undefined;
    if (body.scenarioId && !scenario) return reply.status(404).send({ error: 'unknown_scenario' });

    // Trừ quota theo ước lượng TRƯỚC khi gọi AI (chặn sớm khi hết hạn mức); sau đó bù phần chênh theo token thật
    const historyChars = body.history.reduce((a, h) => a + h.text.length, 0);
    const estimatedTokens = Math.ceil(((body.userText?.length ?? 200) + historyChars) / 3) + 300;
    await pipeline.consume(request, 'llm', estimatedTokens);

    const userText = body.userText ?? 'Xin chào Cu Tít';
    const turn = await tutor.turn({
      userText,
      history: body.history,
      scenario,
      correctionLevel: body.correctionLevel,
      persona: body.persona,
      dialect: body.targetDialect,
      level: body.learnerLevel,
      explanationLanguage: body.explanationLanguage
    });
    if (turn.tokens > estimatedTokens) await pipeline.consume(request, 'llm', turn.tokens - estimatedTokens).catch(() => undefined);

    let audioUrl: string | undefined;
    if (ttsCache.configured) {
      await pipeline.consume(request, 'tts', turn.reply.length);
      ({ audioUrl } = await ttsCache.getAudio({ text: turn.reply, voiceId: 'vi-VN-Standard-A', speed: 1, dialect: body.targetDialect }));
    }
    const turnId = randomUUID();

    if (!String(request.headers.accept ?? '').includes('text/event-stream')) {
      return respond(VoiceTurnResponseSchema, {
        turnId,
        transcript: userText,
        correctedText: turn.correction?.corrected,
        explanation: turn.correction?.explanation,
        audioUrl,
        uiBlocks: turn.blocks
      });
    }

    // AI thật đã sinh xong cả câu (cần JSON hoàn chỉnh để xác thực bằng Zod) => phát chữ nhanh hơn bộ giả lập
    const tokenDelay = config.NODE_ENV === 'test' ? 0 : turn.mock ? 35 : 12;
    async function* events() {
      yield sse({ type: 'transcript', text: userText });
      // Gửi từng từ để chữ hiện dần trên điện thoại
      const words = turn.reply.split(/(?<=\s)/);
      for (const w of words) {
        if (tokenDelay) await sleep(tokenDelay);
        yield sse({ type: 'token', text: w });
      }
      if (turn.correction) yield sse({ type: 'correction', correction: turn.correction });
      if (turn.blocks.length) yield sse({ type: 'blocks', blocks: turn.blocks });
      yield sse({ type: 'done', turnId, reply: turn.reply, audioUrl, completedTasks: turn.completedTasks, mock: turn.mock });
    }

    // Không dùng reply.raw/hijack: giữ nguyên header CORS, helmet, rate-limit của Fastify
    return reply
      .header('content-type', 'text/event-stream; charset=utf-8')
      .header('cache-control', 'no-cache, no-transform')
      .header('x-accel-buffering', 'no')
      .send(Readable.from(events()));
  });
};
