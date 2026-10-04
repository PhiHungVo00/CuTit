import { z } from 'zod';

// POST /speech/synthesize
export const SynthesizeRequestSchema = z.object({
  text: z.string().min(1).max(500),
  voiceId: z.string().default('vi-VN-Standard-A'),
  speed: z.number().min(0.5).max(2.0).default(1.0),
  dialect: z.enum(['north', 'central', 'south']).default('north')
});

export const SynthesizeResponseSchema = z.object({
  audioUrl: z.string().url(),
  durationMs: z.number().int().positive(),
  cached: z.boolean()
});

// POST /vision/label
export const VisionLabelRequestSchema = z.object({
  imageBase64: z.string().min(1)
});

export const VisionLabelResponseSchema = z.object({
  items: z.array(
    z.object({
      vi: z.string(),
      en: z.string(),
      box: z.array(z.number()).optional()
    })
  )
});

// POST /practice/generate
export const DrillGenerateRequestSchema = z.object({
  type: z.enum(['quiz', 'fill', 'listen', 'sentence', 'repeat']),
  topic: z.string().default('chợ quê'),
  level: z.number().int().min(1).max(6).default(1),
  count: z.number().int().min(1).max(10).default(5)
});

export const DrillItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  question: z.string(),
  options: z.array(z.string()).optional(),
  correctIndex: z.number().int().optional(),
  audioUrl: z.string().optional(),
  explanation: z.string()
});

// POST /practice/grade
export const DrillGradeRequestSchema = z.object({
  drillId: z.string(),
  userAnswer: z.string()
});

export const DrillGradeResponseSchema = z.object({
  correct: z.boolean(),
  feedback: z.string(),
  explanation: z.string()
});

// POST /sentence/check (A8)
export const SentenceCheckRequestSchema = z.object({
  tokens: z.array(z.string()),
  itemId: z.string().optional()
});

export const SentenceCheckResponseSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()).default([]),
  hint: z.string().optional()
});

// POST /placement/next (A5)
export const PlacementNextRequestSchema = z.object({
  sessionId: z.string().uuid(),
  answer: z.string().optional()
});

export const PlacementNextResponseSchema = z.object({
  finished: z.boolean(),
  nextQuestion: z.string().optional(),
  assignedLevel: z.number().int().min(1).max(6).optional()
});

// POST /culture/ask
export const CultureAskRequestSchema = z.object({
  question: z.string().min(3).max(300)
});

export const CultureAskResponseSchema = z.object({
  answer: z.string(),
  sources: z.array(z.string())
});

// GET /analytics/summary
export const AnalyticsSummaryResponseSchema = z.object({
  streakDays: z.number().int(),
  studyMinutes: z.number().int(),
  accuracyRate: z.number().min(0).max(100),
  dueCardsCount: z.number().int(),
  cefrEstimate: z.string()
});
