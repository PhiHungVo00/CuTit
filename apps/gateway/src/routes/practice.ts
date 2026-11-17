import { FastifyPluginAsync } from 'fastify';
import {
  DrillGenerateRequestSchema,
  DrillGradeRequestSchema,
  SentenceCheckRequestSchema
} from '@vietlearning/contracts';
import { BambooTreeSyntaxChecker, StaircaseAdaptiveEngine, type AnswerRecord } from '@vietlearning/shared';
import { DRILL_BANK_ITEMS, SENTENCE_TEMPLATES_60, PLACEMENT_QUESTIONS_8 } from '@vietlearning/content';

export const practiceRoutes: FastifyPluginAsync = async (server) => {
  // POST /v1/practice/generate
  server.post('/practice/generate', async (req, reply) => {
    try {
      const parsed = DrillGenerateRequestSchema.safeParse(req.body);
      const { type, topic, level, count } = parsed.success
        ? parsed.data
        : { type: 'quiz', topic: 'chợ quê', level: 1, count: 5 };

      // Lấy từ ngân hàng câu hỏi
      let matched = DRILL_BANK_ITEMS.filter(d => d.type === type);
      if (matched.length === 0) {
        matched = DRILL_BANK_ITEMS;
      }

      // Giới hạn số lượng bài trả về
      const selected = matched.slice(0, count || 5).map(item => ({
        id: item.id,
        type: item.type,
        question: item.question,
        options: item.options || [],
        correctIndex: typeof item.correctAnswer === 'number' ? item.correctAnswer : undefined,
        audioUrl: item.audioPrompt ? `/v1/speech/synthesize?text=${encodeURIComponent(item.audioPrompt)}` : undefined,
        explanation: item.explanation
      }));

      return selected;
    } catch (err: any) {
      server.log.error(err);
      return reply.status(400).send({ error: { code: 'VALIDATION_FAILED', message: err.message } });
    }
  });

  // POST /v1/practice/grade
  server.post('/practice/grade', async (req, reply) => {
    try {
      const { drillId, userAnswer } = DrillGradeRequestSchema.parse(req.body);
      const item = DRILL_BANK_ITEMS.find(d => d.id === drillId);

      if (!item) {
        // Fallback chấp nhận nếu đúng nghĩa
        return {
          correct: true,
          feedback: 'Đã ghi nhận câu trả lời.',
          explanation: 'Chúc mừng bạn đã hoàn thành bài tập.'
        };
      }

      let isCorrect = false;
      const normalizedUser = userAnswer.trim().toLowerCase();

      if (typeof item.correctAnswer === 'number' && item.options) {
        const correctOpt = item.options[item.correctAnswer]?.toLowerCase();
        isCorrect = normalizedUser === String(item.correctAnswer) || normalizedUser === correctOpt;
      } else if (typeof item.correctAnswer === 'string') {
        isCorrect = normalizedUser === item.correctAnswer.trim().toLowerCase();
      } else {
        isCorrect = true;
      }

      return {
        correct: isCorrect,
        feedback: isCorrect
          ? 'Chính xác! Bé Cu Tít khen bạn phản xạ rất tốt.'
          : 'Chưa chính xác rồi. Hãy xem giải thích của Cu Tít nhé.',
        explanation: item.explanation
      };
    } catch (err: any) {
      server.log.error(err);
      return reply.status(400).send({ error: { code: 'VALIDATION_FAILED', message: err.message } });
    }
  });

  // POST /v1/sentence/check (Thuật toán A8)
  server.post('/sentence/check', async (req, reply) => {
    try {
      const { tokens, itemId } = SentenceCheckRequestSchema.parse(req.body);

      // Tìm template tương ứng nếu có
      let template = itemId ? SENTENCE_TEMPLATES_60.find(t => t.id === itemId) : undefined;
      if (!template && tokens.length > 0) {
        // Tìm mẫu câu tương đương theo tập từ vựng
        const tokenSet = new Set(tokens.map(t => t.toLowerCase()));
        template = SENTENCE_TEMPLATES_60.find(t => {
          const templTokens = t.tokens.map(tok => tok.text.toLowerCase().replace(/[.,?!]/g, ''));
          return templTokens.length === tokens.length && templTokens.every(tok => tokenSet.has(tok));
        });
      }

      // Chạy thuật toán A8
      const result = BambooTreeSyntaxChecker.checkOrder(tokens, template);

      return {
        valid: result.valid,
        reconstructedSentence: result.reconstructedSentence,
        errors: result.errors,
        hint: result.hint,
        misplacedIndices: result.misplacedIndices,
        explanation: result.explanation
      };
    } catch (err: any) {
      server.log.error(err);
      return reply.status(400).send({ error: { code: 'VALIDATION_FAILED', message: err.message } });
    }
  });

  // POST /v1/placement/next (Thuật toán A5 Staircase)
  server.post('/placement/next', async (req, reply) => {
    try {
      const body = req.body as { answers?: AnswerRecord[] };
      const answers = body?.answers || [];
      const result = StaircaseAdaptiveEngine.processStep(answers, PLACEMENT_QUESTIONS_8);
      return result;
    } catch (err: any) {
      server.log.error(err);
      return reply.status(500).send({ error: { code: 'SERVER_ERROR', message: err.message } });
    }
  });
};
