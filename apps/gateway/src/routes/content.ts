import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  CultureAskRequestSchema,
  CultureAskResponseSchema,
  PitchReferenceResponseSchema,
  VisionLabelRequestSchema,
  VisionLabelResponseSchema
} from '@vietlearning/contracts';
import { searchCulture } from '@vietlearning/content';
import type { RouteDeps } from '../app.js';
import { parseOr400, respond } from '../lib/validate.js';
import { answerCulture, labelImage } from '../services/ai/tasks.js';

const MB = 1024 * 1024;
const ItemIdParams = z.object({ id: z.string().regex(/^[\w-]{1,64}$/) });

/** Các route nội dung (ảnh, cao độ mẫu, văn hóa). Dữ liệu người học nằm ở routes/me.ts (DB). */
export const contentRoutes: FastifyPluginAsync<RouteDeps> = async (server, { pipeline, config, llm, vision }) => {
  // POST /v1/vision/label (ảnh base64 nên cần giới hạn body lớn hơn). Có AI => nhận diện thật; không => nhãn mẫu, mock: true
  server.post('/vision/label', { bodyLimit: config.AUDIO_BODY_LIMIT_MB * MB }, async (req, reply) => {
    const body = parseOr400(VisionLabelRequestSchema, req.body, reply);
    if (!body) return reply;
    // Chỉ nhận ảnh thật (kiểm tra chữ ký tệp), không chuyển dữ liệu tùy ý sang nhà cung cấp Vision
    const head = Buffer.from(body.imageBase64.slice(0, 16), 'base64');
    const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    const isPng = head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (!isJpeg && !isPng) return reply.status(415).send({ error: 'unsupported_image', message: 'Chỉ nhận ảnh JPEG hoặc PNG' });
    if (vision) {
      // Hết chuỗi vision / AI lỗi => hoàn lại lượt ảnh
      const { items, provider } = await pipeline.run(req, [['vision', 1]], () => labelImage(vision, { mimeType: isJpeg ? 'image/jpeg' : 'image/png', base64: body.imageBase64 }));
      if (provider) reply.header('x-ai-provider', provider);
      return respond(VisionLabelResponseSchema, { items, mock: false, remaining: await pipeline.remaining(req) });
    }
    await pipeline.consume(req, 'vision', 1);
    return respond(VisionLabelResponseSchema, {
      remaining: await pipeline.remaining(req),
      items: [
        { vi: 'cái cốc', en: 'cup', box: [0.1, 0.2, 0.3, 0.4] },
        { vi: 'quyển sách', en: 'book', box: [0.5, 0.5, 0.4, 0.3] },
        { vi: 'cái bàn', en: 'table' }
      ],
      mock: true
    });
  });

  // GET /v1/pitch/reference/:id
  server.get('/pitch/reference/:id', async (req, reply) => {
    const params = parseOr400(ItemIdParams, req.params, reply);
    if (!params) return reply;
    return respond(PitchReferenceResponseSchema, {
      itemId: params.id,
      tone: 'sac',
      contourSemitones: [12.0, 13.5, 15.0, 16.5]
    });
  });

  // POST /v1/culture/ask
  server.post('/culture/ask', async (req, reply) => {
    const body = parseOr400(CultureAskRequestSchema, req.body, reply);
    if (!body) return reply;
    const tokensEstimate = Math.ceil(body.question.length / 3) + 300;
    // Truy hồi thẻ (packages/content) rồi để LLM diễn giải CHỈ từ các thẻ đó (RAG). Không có thẻ khớp
    // => không gọi AI (tránh bịa). Không có AI => ghép thẻ theo mẫu, mock: true.
    const cards = searchCulture(body.question, 3);
    if (llm && cards.length) {
      const { answer, sources, provider } = await pipeline.run(req, [['llm', tokensEstimate]], () => answerCulture(llm, body.question, cards, body.language));
      if (provider) reply.header('x-ai-provider', provider);
      return respond(CultureAskResponseSchema, { answer, sources, mock: false, remaining: await pipeline.remaining(req) });
    }
    await pipeline.consume(req, 'llm', tokensEstimate);
    return respond(CultureAskResponseSchema, {
      remaining: await pipeline.remaining(req),
      mock: cards.length > 0,
      answer: cards.length
        ? cards.map((c) => (body.language === 'en' ? `${c.titleEn}: ${c.contentEn}` : `${c.title}: ${c.content}`)).join('\n\n')
        : body.language === 'en'
          ? 'Cu Tít has no culture card matching this question yet. Try asking about greetings, family meals, Tết or taboos!'
          : 'Bé Cu Tít chưa có thẻ văn hóa nào khớp với câu hỏi này. Bạn thử hỏi về chào hỏi, bữa cơm, ngày Tết hoặc kiêng kỵ nhé!',
      sources: cards.map((c) => c.id)
    });
  });
};
