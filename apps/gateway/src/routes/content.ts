import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  AnalyticsSummaryResponseSchema,
  CultureAskRequestSchema,
  CultureAskResponseSchema,
  PitchReferenceResponseSchema,
  PreferencesSchema,
  SrsDueResponseSchema,
  VisionLabelRequestSchema,
  VisionLabelResponseSchema
} from '@vietlearning/contracts';
import type { RouteDeps } from '../app.js';
import { parseOr400, respond } from '../lib/validate.js';

const MB = 1024 * 1024;
const ItemIdParams = z.object({ id: z.string().regex(/^[\w-]{1,64}$/) });

/** Các route nội dung / học viên. Hiện vẫn trả dữ liệu MOCK nhưng đã xác thực đầu vào/đầu ra. */
export const contentRoutes: FastifyPluginAsync<RouteDeps> = async (server, { pipeline, config }) => {
  // POST /v1/vision/label (ảnh base64 nên cần giới hạn body lớn hơn)
  server.post('/vision/label', { bodyLimit: config.AUDIO_BODY_LIMIT_MB * MB }, async (req, reply) => {
    const body = parseOr400(VisionLabelRequestSchema, req.body, reply);
    if (!body) return reply;
    await pipeline.consume(req, 'vision', 1);
    return respond(VisionLabelResponseSchema, {
      items: [
        { vi: 'Nón lá', en: 'Conical hat', box: [10, 20, 80, 90] },
        { vi: 'Quán nước gốc đa', en: 'Banyan tree tea stall', box: [50, 60, 200, 300] }
      ]
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
    await pipeline.consume(req, 'llm', Math.ceil(body.question.length / 3) + 300);
    return respond(CultureAskResponseSchema, {
      answer:
        'Ở Việt Nam, khi chào người lớn tuổi, người nhỏ thường khoanh tay trước ngực để bày tỏ sự kính trọng.',
      sources: ['card_c1_khoanh_tay']
    });
  });

  // GET /v1/srs/due
  server.get('/srs/due', async () =>
    respond(SrsDueResponseSchema, [
      { id: 'card-1', itemRef: 'ngô_bắp', ease: 250, intervalDays: 1, dueAt: new Date().toISOString() }
    ])
  );

  // GET /v1/analytics/summary
  server.get('/analytics/summary', async () =>
    respond(AnalyticsSummaryResponseSchema, {
      streakDays: 5,
      studyMinutes: 45,
      accuracyRate: 88,
      dueCardsCount: 3,
      cefrEstimate: 'A1'
    })
  );

  // GET /v1/preferences
  server.get('/preferences', async () =>
    respond(PreferencesSchema, {
      voiceId: 'vi-VN-Standard-A',
      speed: 1.0,
      dialect: 'north',
      correctionLevel: 'gentle',
      persona: 'be_cu_tit'
    })
  );

  // PUT /v1/preferences (MOCK: xác thực rồi trả lại, chưa lưu DB)
  server.put('/preferences', async (req, reply) => {
    const body = parseOr400(PreferencesSchema, req.body, reply);
    if (!body) return reply;
    return respond(PreferencesSchema, body);
  });
};
