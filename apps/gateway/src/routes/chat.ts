import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { FastifyPluginAsync } from 'fastify';
import { ChatEventSchema, VoiceTurnRequestSchema, VoiceTurnResponseSchema, type ChatEvent } from '@vietlearning/contracts';
import { ROLEPLAY_SCENARIOS } from '@vietlearning/content';
import type { RouteDeps } from '../app.js';
import { parseOr400, respond } from '../lib/validate.js';
import { isChild, requireMediaConsent, requireNotFreeChat } from '../pipeline/accountPolicy.js';

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
export const chatRoutes: FastifyPluginAsync<RouteDeps> = async (server, { pipeline, config, tutor, db }) => {
  server.post('/chat/turn', { bodyLimit: config.AUDIO_BODY_LIMIT_MB * MB }, async (request, reply) => {
    const body = parseOr400(VoiceTurnRequestSchema, request.body, reply);
    if (!body) return reply;
    const scenario = body.scenarioId ? ROLEPLAY_SCENARIOS.find((s) => s.id === body.scenarioId) : undefined;
    if (body.scenarioId && !scenario) return reply.status(404).send({ error: 'unknown_scenario' });
    // GĐ4b (D4): hồ sơ trẻ chỉ nhập vai có kịch bản (không chat tự do, không gọi thoại tự do); âm thanh cần phụ huynh cho phép.
    // Chặn TRƯỚC khi trừ hạn mức và trước khi mở luồng SSE (lỗi vẫn là JSON 403)
    if (isChild(request)) {
      if (!scenario || body.mode === 'call') requireNotFreeChat(request);
      if (body.userAudioBase64) await requireMediaConsent(db, request);
    }

    // GĐ3: một lượt hội thoại AI (đơn vị người học hiểu được, báo "hết lượt" rõ ràng); lưu DB theo ngày UTC
    const turnsUsed = await pipeline.consume(request, 'turn', 1);
    const turnsLeft = Math.max(0, pipeline.limitFor(request, 'turn') - turnsUsed);
    // Trừ quota theo ước lượng TRƯỚC khi gọi AI (chặn sớm khi hết hạn mức); sau đó bù phần chênh theo token thật
    const historyChars = body.history.reduce((a, h) => a + h.text.length, 0);
    const estimatedTokens = Math.ceil(((body.userText?.length ?? 200) + historyChars) / 3) + 300;
    await pipeline.consume(request, 'llm', estimatedTokens);

    const userText = body.userText ?? 'Xin chào Cu Tít';
    const turnId = randomUUID();

    /** Gọi gia sư (AI hoặc bộ giả lập) rồi TTS nếu có; tutor.turn không ném lỗi (lỗi AI => bộ giả lập) */
    const produce = async () => {
      const turn = await tutor.turn({
        userText,
        history: body.history,
        scenario,
        correctionLevel: body.correctionLevel,
        persona: body.persona,
        dialect: body.targetDialect,
        level: body.learnerLevel,
        explanationLanguage: body.explanationLanguage,
        mode: body.mode
      });
      if (turn.tokens > estimatedTokens) await pipeline.addUsage(request, 'llm', turn.tokens - estimatedTokens).catch(() => undefined);
      // GĐ3: KHÔNG tổng hợp giọng ở đây — chờ TTS làm chậm cả lượt (dưới watchdog 15 s của client) và đốt hạn mức
      // TTS cho cả chat gõ. Màn gọi thoại tự gọi /v1/speech/synthesize sau `done`, lỗi thì dùng TTS của máy.
      const audioUrl: string | undefined = undefined;
      return { turn, audioUrl };
    };

    if (!String(request.headers.accept ?? '').includes('text/event-stream')) {
      const { turn, audioUrl } = await produce();
      return respond(VoiceTurnResponseSchema, {
        turnId,
        transcript: userText,
        correctedText: turn.correction?.corrected,
        explanation: turn.correction?.explanation,
        audioUrl,
        uiBlocks: turn.blocks
      });
    }

    async function* events() {
      // Gửi header + transcript NGAY: client không phải chờ AI trong timeout kết nối, watchdog luồng bắt đầu đếm
      yield sse({ type: 'transcript', text: userText });
      let produced: Awaited<ReturnType<typeof produce>>;
      try {
        produced = await produce();
      } catch (err) {
        yield sse({ type: 'error', code: (err as { code?: string }).code ?? 'internal_error', message: (err as Error).message });
        return;
      }
      const { turn, audioUrl } = produced;
      // AI thật đã sinh xong cả câu (cần JSON hoàn chỉnh để xác thực bằng Zod) => phát chữ nhanh hơn bộ giả lập
      const tokenDelay = config.NODE_ENV === 'test' ? 0 : turn.mock ? 35 : 12;
      for (const w of turn.reply.split(/(?<=\s)/)) {
        if (tokenDelay) await sleep(tokenDelay);
        yield sse({ type: 'token', text: w });
      }
      if (turn.correction) yield sse({ type: 'correction', correction: turn.correction });
      if (turn.blocks.length) yield sse({ type: 'blocks', blocks: turn.blocks });
      yield sse({ type: 'done', turnId, reply: turn.reply, audioUrl, completedTasks: turn.completedTasks, mock: turn.mock, newWords: turn.newWords, turnsLeft });
    }

    // Không dùng reply.raw/hijack: giữ nguyên header CORS, helmet, rate-limit của Fastify
    return reply
      .header('content-type', 'text/event-stream; charset=utf-8')
      .header('cache-control', 'no-cache, no-transform')
      .header('x-accel-buffering', 'no')
      .send(Readable.from(events()));
  });
};
