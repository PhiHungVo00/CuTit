import { FastifyPluginAsync } from 'fastify';
import {
  DrillGenerateRequestSchema,
  DrillGradeRequestSchema,
  SentenceCheckRequestSchema,
  PlacementNextRequestSchema
} from '@vietlearning/contracts';

export const practiceRoutes: FastifyPluginAsync = async (server) => {
  // POST /v1/practice/generate
  server.post('/practice/generate', async (req, reply) => {
    return [
      {
        id: 'drill-1',
        type: 'quiz',
        question: 'Từ nào dưới đây là từ chỉ quả bắp trong phương ngữ miền Bắc?',
        options: ['Ngô', 'Bắp', 'Khóm', 'Thơm'],
        correctIndex: 0,
        explanation: 'Người miền Bắc gọi "bắp" là "ngô".'
      }
    ];
  });

  // POST /v1/practice/grade
  server.post('/practice/grade', async (req, reply) => {
    return {
      correct: true,
      feedback: 'Chính xác! Bạn làm rất tốt.',
      explanation: 'Người miền Bắc dùng từ "ngô" trong hầu hết mọi ngữ cảnh giao tiếp.'
    };
  });

  // POST /v1/sentence/check (A8)
  server.post('/sentence/check', async (req, reply) => {
    return {
      valid: true,
      errors: [],
      hint: 'Trật tự câu S + V + O chuẩn tiếng Việt.'
    };
  });

  // POST /v1/placement/next (A5)
  server.post('/placement/next', async (req, reply) => {
    return {
      finished: false,
      nextQuestion: 'Chọn cặp từ xưng hô phù hợp khi học sinh chào thầy giáo.',
      assignedLevel: 1
    };
  });
};
