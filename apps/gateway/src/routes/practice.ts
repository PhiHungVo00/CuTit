import { FastifyPluginAsync } from 'fastify';
import {
  DrillGenerateRequestSchema,
  DrillGradeRequestSchema,
  DrillGradeResponseSchema,
  DrillListResponseSchema,
  PlacementNextRequestSchema,
  PlacementNextResponseSchema,
  SentenceCheckRequestSchema,
  SentenceCheckResponseSchema
} from '@vietlearning/contracts';
import type { RouteDeps } from '../app.js';
import { parseOr400, respond } from '../lib/validate.js';

/** Các route luyện tập. Hiện vẫn trả dữ liệu MOCK nhưng đã xác thực đầu vào/đầu ra. */
export const practiceRoutes: FastifyPluginAsync<RouteDeps> = async (server, { pipeline }) => {
  // POST /v1/practice/generate (LLM sinh bài tập)
  server.post('/practice/generate', async (req, reply) => {
    const body = parseOr400(DrillGenerateRequestSchema, req.body, reply);
    if (!body) return reply;
    await pipeline.consume(req, 'llm', body.count * 200);

    return respond(DrillListResponseSchema, [
      {
        id: 'drill-1',
        type: 'quiz',
        question: 'Từ nào dưới đây là từ chỉ quả bắp trong phương ngữ miền Bắc?',
        options: ['Ngô', 'Bắp', 'Khóm', 'Thơm'],
        correctIndex: 0,
        explanation: 'Người miền Bắc gọi "bắp" là "ngô".'
      }
    ]);
  });

  // POST /v1/practice/grade
  server.post('/practice/grade', async (req, reply) => {
    const body = parseOr400(DrillGradeRequestSchema, req.body, reply);
    if (!body) return reply;
    return respond(DrillGradeResponseSchema, {
      correct: true,
      feedback: 'Chính xác! Bạn làm rất tốt.',
      explanation: 'Người miền Bắc dùng từ "ngô" trong hầu hết mọi ngữ cảnh giao tiếp.'
    });
  });

  // POST /v1/sentence/check (A8)
  server.post('/sentence/check', async (req, reply) => {
    const body = parseOr400(SentenceCheckRequestSchema, req.body, reply);
    if (!body) return reply;
    return respond(SentenceCheckResponseSchema, {
      valid: true,
      errors: [],
      hint: 'Trật tự câu S + V + O chuẩn tiếng Việt.'
    });
  });

  // POST /v1/placement/next (A5)
  server.post('/placement/next', async (req, reply) => {
    const body = parseOr400(PlacementNextRequestSchema, req.body, reply);
    if (!body) return reply;
    return respond(PlacementNextResponseSchema, {
      finished: false,
      nextQuestion: 'Chọn cặp từ xưng hô phù hợp khi học sinh chào thầy giáo.',
      assignedLevel: 1
    });
  });
};
