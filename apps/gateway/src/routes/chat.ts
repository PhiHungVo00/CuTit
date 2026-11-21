import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { FastifyPluginAsync } from 'fastify';
import { ChatEventSchema, ChatSummarizeRequestSchema, ChatSummarizeResponseSchema, VoiceTurnRequestSchema, VoiceTurnResponseSchema, type ChatEvent } from '@vietlearning/contracts';
import { ROLEPLAY_SCENARIOS } from '@vietlearning/content';
import type { RouteDeps } from '../app.js';
import { parseOr400, respond } from '../lib/validate.js';
import { GatewayError } from '../pipeline/RequestPipeline.js';
import { summarizeConversation } from '../services/chat/summary.js';

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
export const chatRoutes: FastifyPluginAsync<RouteDeps> = async (server, { pipeline, config, tutor, llm }) => {
  server.post('/chat/turn', { bodyLimit: config.AUDIO_BODY_LIMIT_MB * MB }, async (request, reply) => {
    const body = parseOr400(VoiceTurnRequestSchema, request.body, reply);
    if (!body) return reply;
    const scenario = body.scenarioId ? ROLEPLAY_SCENARIOS.find((s) => s.id === body.scenarioId) : undefined;
    if (body.scenarioId && !scenario) return reply.status(404).send({ error: 'unknown_scenario' });

    // GĐ3: một lượt hội thoại AI (đơn vị người học hiểu được, báo "hết lượt" rõ ràng); lưu DB theo ngày giờ Việt Nam.
    // Trừ theo ước lượng TRƯỚC khi gọi AI (chặn sớm khi hết hạn mức); sau đó bù phần chênh theo token thật.
    // AI lỗi / hết chuỗi dự phòng (llm_busy) => hold.refund(): KHÔNG trừ lượt của người dùng.
    // Ảnh: chỉ nhận JPEG/PNG thật (chữ ký tệp), không chuyển dữ liệu tùy ý sang nhà cung cấp Vision
    let image: { mimeType: 'image/jpeg' | 'image/png'; base64: string } | undefined;
    if (body.imageBase64) {
      const head = Buffer.from(body.imageBase64.slice(0, 16), 'base64');
      const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
      const isPng = head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      if (!isJpeg && !isPng) return reply.status(415).send({ error: 'unsupported_image', message: 'Chỉ nhận ảnh JPEG hoặc PNG' });
      image = { mimeType: isJpeg ? 'image/jpeg' : 'image/png', base64: body.imageBase64 };
    }
    const historyChars = body.history.reduce((a, h) => a + h.text.length, 0);
    const estimatedTokens = Math.ceil(((body.userText?.length ?? 200) + historyChars + (body.summary?.length ?? 0)) / 3) + 300 + (image ? 300 : 0);
    // Ảnh trong chat / lượt gọi video = 1 turns + 1 visionImages; AI lỗi => hoàn cả hai (hold.refund)
    const hold = await pipeline.reserve(request, [
      ['turn', 1],
      ...(image ? [['vision', 1] as ['vision', number]] : []),
      ['llm', estimatedTokens]
    ]);

    const userText = body.userText ?? 'Xin chào Cu Tít';
    const turnId = randomUUID();

    /** Gọi gia sư (AI hoặc bộ giả lập) rồi TTS nếu có; tutor.turn không ném lỗi (lỗi AI => bộ giả lập) */
    const produce = async () => {
      let turn: Awaited<ReturnType<typeof tutor.turn>>;
      try {
        turn = await tutor.turn({
          userText,
          history: body.history,
          scenario,
          correctionLevel: body.correctionLevel,
          persona: body.persona,
          dialect: body.targetDialect,
          level: body.learnerLevel,
          explanationLanguage: body.explanationLanguage,
          mode: body.mode,
          summary: body.summary,
          image
        });
      } catch (err) {
        await hold.refund(err);
        throw err;
      }
      if (turn.tokens > estimatedTokens) await pipeline.addUsage(request, 'llm', turn.tokens - estimatedTokens).catch(() => undefined);
      // Đọc SAU khi bù token thật để llmTokens còn lại không bị ước cao
      const remaining = await pipeline.remaining(request).catch(() => undefined);
      // GĐ3: KHÔNG tổng hợp giọng ở đây — chờ TTS làm chậm cả lượt (dưới watchdog 15 s của client) và đốt hạn mức
      // TTS cho cả chat gõ. Màn gọi thoại tự gọi /v1/speech/synthesize sau `done`, lỗi thì dùng TTS của máy.
      const audioUrl: string | undefined = undefined;
      return { turn, audioUrl, remaining };
    };

    if (!String(request.headers.accept ?? '').includes('text/event-stream')) {
      const { turn, audioUrl, remaining } = await produce();
      // Nguồn AI đã trả lời (tên nguồn, không có khóa) — chỉ để vận hành/gỡ lỗi; SSE không đặt được vì header đã gửi trước khi gọi AI
      if (turn.provider) reply.header('x-ai-provider', turn.provider);
      return respond(VoiceTurnResponseSchema, {
        turnId,
        transcript: userText,
        correctedText: turn.correction?.corrected,
        explanation: turn.correction?.explanation,
        audioUrl,
        uiBlocks: turn.blocks,
        remaining
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
      const { turn, audioUrl, remaining } = produced;
      // AI thật đã sinh xong cả câu (cần JSON hoàn chỉnh để xác thực bằng Zod) => phát chữ nhanh hơn bộ giả lập
      const tokenDelay = config.NODE_ENV === 'test' ? 0 : turn.mock ? 35 : 12;
      for (const w of turn.reply.split(/(?<=\s)/)) {
        if (tokenDelay) await sleep(tokenDelay);
        yield sse({ type: 'token', text: w });
      }
      if (turn.correction) yield sse({ type: 'correction', correction: turn.correction });
      if (turn.blocks.length) yield sse({ type: 'blocks', blocks: turn.blocks });
      yield sse({ type: 'done', turnId, reply: turn.reply, audioUrl, completedTasks: turn.completedTasks, mock: turn.mock, newWords: turn.newWords, turnsLeft: remaining?.turns, remaining });
    }

    // Không dùng reply.raw/hijack: giữ nguyên header CORS, helmet, rate-limit của Fastify
    return reply
      .header('content-type', 'text/event-stream; charset=utf-8')
      .header('cache-control', 'no-cache, no-transform')
      .header('x-accel-buffering', 'no')
      .send(Readable.from(events()));
  });

  /**
   * POST /v1/chat/summarize — viết lại bản tóm tắt cuộc trò chuyện (≤ 600 ký tự, JSON qua Zod).
   * KHÔNG trừ `turns` của người dùng; trừ token LLM (ước lượng rồi bù theo token thật) nên tính vào trần chung.
   * AI bận / lỗi => 503 llm_busy và hoàn token; client giữ tóm tắt cũ, không chặn lượt chat.
   * Chưa cấu hình AI => 503 (không bịa bản tóm tắt).
   */
  server.post('/chat/summarize', async (request, reply) => {
    const body = parseOr400(ChatSummarizeRequestSchema, request.body, reply);
    if (!body) return reply;
    if (!llm) throw new GatewayError(503, 'llm_busy', 'Cu Tít đang bận, thử lại sau ít giây');
    const chars = body.history.reduce((a, h) => a + h.text.length, 0) + (body.previousSummary?.length ?? 0);
    const estimatedTokens = Math.ceil(chars / 3) + 500;
    const hold = await pipeline.reserve(request, [['llm', estimatedTokens]]);
    let out: Awaited<ReturnType<typeof summarizeConversation>>;
    try {
      out = await summarizeConversation(llm, body);
    } catch (err) {
      await hold.refund(err);
      throw err;
    }
    if (out.tokens > estimatedTokens) await pipeline.addUsage(request, 'llm', out.tokens - estimatedTokens).catch(() => undefined);
    if (out.provider) reply.header('x-ai-provider', out.provider);
    return respond(ChatSummarizeResponseSchema, { summary: out.summary, remaining: await pipeline.remaining(request).catch(() => undefined) });
  });
};
