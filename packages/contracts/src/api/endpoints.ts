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

// POST /vision/label (M4) — client thu nhỏ ảnh ≤ 640px JPEG trước khi gửi (~50–150 KB)
export const VisionLabelRequestSchema = z.object({
  /** JPEG/PNG mã hóa base64 (không kèm tiền tố data:). Tối đa ~1.5 MB ảnh */
  imageBase64: z
    .string()
    .min(100)
    .max(2_000_000)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Không phải base64')
});

export const VisionLabelResponseSchema = z.object({
  items: z
    .array(
      z.object({
        vi: z.string().max(60),
        en: z.string().max(60),
        /** khung [x, y, rộng, cao] theo tỉ lệ 0–1 của ảnh */
        box: z.array(z.number()).length(4).optional()
      })
    )
    .max(10),
  /** true khi nhãn do bộ giả lập trả (chưa nối dịch vụ nhận diện ảnh) */
  mock: z.boolean().default(false)
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

// POST /placement/next (A5) — kiểm tra xếp lớp thích ứng, hội tụ sau 8–12 câu
export const PlacementNextRequestSchema = z.object({
  sessionId: z.string().uuid(),
  /** câu trả lời cho câu hỏi vừa nhận (bỏ trống ở lần gọi đầu) */
  answer: z
    .object({
      questionId: z.string().min(1).max(32),
      choice: z.number().int().min(0).max(9)
    })
    .optional()
});

export const PlacementQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  promptEn: z.string().optional(),
  /** lựa chọn đã được Gateway xáo thứ tự */
  options: z.array(z.string()).min(2),
  /** số thứ tự câu hiện tại (1-based) */
  index: z.number().int().positive(),
  maxQuestions: z.number().int().positive()
});

export const PlacementNextResponseSchema = z.object({
  finished: z.boolean(),
  question: PlacementQuestionSchema.optional(),
  /** CEFR 1–6, có khi finished = true */
  assignedLevel: z.number().int().min(1).max(6).optional(),
  /** câu trả lời trước có đúng không (để phản hồi ngay) */
  lastCorrect: z.boolean().optional()
});

// POST /culture/ask
export const CultureAskRequestSchema = z.object({
  question: z.string().min(3).max(300),
  /** Ngôn ngữ của câu trả lời */
  language: z.enum(['vi', 'en']).default('vi')
});

export const CultureAskResponseSchema = z.object({
  answer: z.string(),
  sources: z.array(z.string()),
  /** true = câu trả lời ghép từ thẻ theo mẫu, chưa qua LLM */
  mock: z.boolean().default(false)
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
  /** mốc thời gian từng từ: có thể rỗng nếu nhà cung cấp không trả */
  words: z.array(z.object({ w: z.string(), start: z.number(), end: z.number() })),
  /** true = câu mẫu, chưa nối dịch vụ nhận dạng giọng nói */
  mock: z.boolean().default(false)
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
  persona: z.string(),
  /** Ngôn ngữ giao diện (nội dung học vẫn là tiếng Việt) */
  uiLanguage: z.enum(['vi', 'en']).default('en')
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
