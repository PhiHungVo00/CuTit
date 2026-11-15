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
  hint: z.string().optional(),
  /** chỉ số (trong câu người học gửi) của các từ đặt sai chỗ — A8 */
  misplaced: z.array(z.number().int().nonnegative()).default([]),
  /** thứ tự chuẩn để hiển thị sau khi chấm */
  correctOrder: z.array(z.string()).optional()
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

/**
 * Tải âm thanh lên (POST /speech/transcribe, /speech/assess): multipart/form-data, KHÔNG base64.
 * - Phần file tên "audio": WAV PCM 16-bit mono 16 kHz (khuyến nghị; client dùng encodeWav của audio-dsp),
 *   hoặc audio/webm, audio/ogg.
 * - Các trường text đi kèm theo schema bên dưới.
 * Base64 trong JSON làm dữ liệu tăng ~33% trên mạng di động (hàng chờ Q13).
 */
export const AUDIO_UPLOAD_MIME_TYPES = ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/webm', 'audio/ogg'] as const;

export const AudioUploadFieldsSchema = z.object({
  /** id mục luyện tập (vd. âm tiết "má") */
  itemId: z.string().regex(/^[\w-]{1,64}$/).optional(),
  targetTone: z.enum(['ngang', 'huyen', 'sac', 'hoi', 'nga', 'nang']).optional(),
  expectedText: z.string().min(1).max(200).optional()
});
export type AudioUploadFields = z.infer<typeof AudioUploadFieldsSchema>;

// POST /speech/transcribe
export const TranscribeResponseSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1),
  words: z.array(z.object({ w: z.string(), start: z.number(), end: z.number() }))
});

// GET /speech/voices
export const VoiceListResponseSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    dialect: z.enum(['north', 'central', 'south'])
  })
);

// POST /speech/assess (A3 + A2)
export const AssessResponseSchema = z.object({
  transcript: z.string(),
  diff: z.array(z.object({ expected: z.string(), actual: z.string() })),
  score: z.number().min(0).max(100),
  hints: z.array(z.string())
});

export const DrillListResponseSchema = z.array(DrillItemSchema);

// GET /pitch/reference/:id
export const PitchReferenceResponseSchema = z.object({
  itemId: z.string(),
  tone: z.enum(['ngang', 'huyen', 'sac', 'hoi', 'nga', 'nang']),
  contourSemitones: z.array(z.number())
});

// GET /srs/due
export const SrsDueResponseSchema = z.array(
  z.object({
    id: z.string(),
    itemRef: z.string(),
    ease: z.number().int(),
    intervalDays: z.number().int(),
    dueAt: z.string().datetime()
  })
);

// GET & PUT /preferences
export const PreferencesSchema = z.object({
  voiceId: z.string(),
  speed: z.number().min(0.5).max(2.0),
  dialect: z.enum(['north', 'central', 'south']),
  correctionLevel: z.enum(['gentle', 'strict', 'off']),
  persona: z.string()
});

// Lỗi chuẩn hóa của Gateway
export const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  issues: z.array(z.unknown()).optional()
});

// GET /analytics/summary
export const AnalyticsSummaryResponseSchema = z.object({
  streakDays: z.number().int(),
  studyMinutes: z.number().int(),
  accuracyRate: z.number().min(0).max(100),
  dueCardsCount: z.number().int(),
  cefrEstimate: z.string()
});
