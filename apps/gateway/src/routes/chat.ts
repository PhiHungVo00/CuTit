import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { FastifyPluginAsync } from 'fastify';
import { ChatEventSchema, VoiceTurnRequestSchema, VoiceTurnResponseSchema, type ChatEvent } from '@vietlearning/contracts';
import { ROLEPLAY_SCENARIOS } from '@vietlearning/content';
import type { RouteDeps } from '../app.js';
import { parseOr400, respond } from '../lib/validate.js';
import { mockTutorTurn } from '../services/chat/mockTutor.js';

const MB = 1024 * 1024;

/** Xác thực từng sự kiện trước khi gửi (Nguyên tắc 6), rồi đóng khung SSE — mọi sự kiện kết thúc bằng \n\n */
function sse(event: ChatEvent): string {
  return `data: ${JSON.stringify(ChatEventSchema.parse(event))}\n\n`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GoF Facade Pattern (7)
 * Gom chuỗi gọi STT, LLM Streaming và phát TTS sớm thành một endpoint /v1/chat/turn duy nhất.
 * LLM hiện là GIA SƯ GIẢ LẬP (services/chat/mockTutor.ts): mọi lượt gắn mock: true.
 *
 * - Accept: text/event-stream => luồng SSE (transcript → token* → correction? → blocks? → done)
 * - Khác => JSON một lần (giữ tương thích bản cũ)
 * Kiểm tra request và trừ quota TRƯỚC khi mở luồng, để lỗi 400/429 vẫn là JSON bình thường.
 */
export const chatRoutes: FastifyPluginAsync<RouteDeps> = async (server, { pipeline, ttsCache, config }) => {
  server.post('/chat/turn', { bodyLimit: config.AUDIO_BODY_LIMIT_MB * MB }, async (request, reply) => {
    const body = parseOr400(VoiceTurnRequestSchema, request.body, reply);
    if (!body) return reply;
    const scenario = body.scenarioId ? ROLEPLAY_SCENARIOS.find((s) => s.id === body.scenarioId) : undefined;
    if (body.scenarioId && !scenario) return reply.status(404).send({ error: 'unknown_scenario' });

    // Ước lượng token cho LLM (thay bằng số token thật từ Provider khi nối API)
    const historyChars = body.history.reduce((a, h) => a + h.text.length, 0);
    const estimatedTokens = Math.ceil(((body.userText?.length ?? 200) + historyChars) / 3) + 300;
    await pipeline.consume(request, 'llm', estimatedTokens);

    const userText = body.userText ?? 'Xin chào Cu Tít';
    const turn = mockTutorTurn({ userText, history: body.history, scenario, correctionLevel: body.correctionLevel, persona: body.persona });

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

    const tokenDelay = config.NODE_ENV === 'test' ? 0 : 35;
    async function* events() {
      yield sse({ type: 'transcript', text: userText });
      // Giả lập LLM streaming: gửi từng từ (LLM thật sẽ gửi token khi sinh ra)
      const words = turn.reply.split(/(?<=\s)/);
      for (const w of words) {
        if (tokenDelay) await sleep(tokenDelay);
        yield sse({ type: 'token', text: w });
      }
      if (turn.correction) yield sse({ type: 'correction', correction: turn.correction });
      if (turn.blocks.length) yield sse({ type: 'blocks', blocks: turn.blocks });
      yield sse({ type: 'done', turnId, reply: turn.reply, audioUrl, completedTasks: turn.completedTasks, mock: true });
    }

    // Không dùng reply.raw/hijack: giữ nguyên header CORS, helmet, rate-limit của Fastify
    return reply
      .header('content-type', 'text/event-stream; charset=utf-8')
      .header('cache-control', 'no-cache, no-transform')
      .header('x-accel-buffering', 'no')
      .send(Readable.from(events()));
  });
};
