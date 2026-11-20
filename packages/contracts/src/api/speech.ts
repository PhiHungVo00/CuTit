import { z } from 'zod';
import { RemainingSchema } from './chat.js';

/**
 * Hợp đồng GĐ2 — kỹ năng nói tiếng Việt:
 * - POST /v1/speech/assess (A3 + A2): chấm câu đọc lại, từng âm tiết đúng / sai thanh / sai / thiếu / thừa.
 * - Gói âm thanh dựng sẵn theo miền (D9): GET /audio/packs/<gói>-<miền>.json → tệp GET /audio/<hash>.wav.
 * - POST /v1/practice/explain: giải thích câu trả lời bằng LLM (JSON + Zod, Nguyên tắc 6).
 */

export const ToneIdSchema = z.enum(['ngang', 'huyen', 'sac', 'hoi', 'nga', 'nang']);
export const DialectSchema = z.enum(['north', 'central', 'south']);

/**
 * Một âm tiết sau khi căn chỉnh câu mẫu với lời người học (đơn vị so khớp = âm tiết, chuẩn hóa NFC).
 * - correct: khớp hoàn toàn
 * - tone: đúng chữ nhưng sai dấu thanh (vd. cần "má", nghe "ma")
 * - wrong: khác chữ · missing: người học bỏ sót · extra: người học nói thêm
 */
export const AssessWordSchema = z.object({
  expected: z.string().nullable(),
  heard: z.string().nullable(),
  status: z.enum(['correct', 'tone', 'wrong', 'missing', 'extra']),
  expectedTone: ToneIdSchema.optional(),
  heardTone: ToneIdSchema.optional(),
  /** A2 trên contour của âm tiết này — chỉ có khi đoạn hữu thanh khớp số âm tiết (toneChecked) */
  pitch: z
    .object({
      score: z.number().min(0).max(100),
      /** thanh có contour giống nhất trong 6 thanh */
      bestMatch: ToneIdSchema
    })
    .optional()
});
export type AssessWord = z.infer<typeof AssessWordSchema>;

// POST /speech/assess (A3 + A2) — multipart: "audio" + expectedText (bắt buộc)
export const AssessResponseSchema = z.object({
  /** lời chép được (rỗng khi mock) */
  transcript: z.string(),
  words: z.array(AssessWordSchema),
  score: z.number().min(0).max(100),
  /** true = đã so contour từng âm tiết (A2) */
  toneChecked: z.boolean(),
  /** true = Gateway chưa nối nhận dạng giọng nói: không chấm chữ, client coi như bỏ qua */
  mock: z.boolean(),
  remaining: RemainingSchema.optional(),
  hints: z.array(z.string())
});
export type AssessResponse = z.infer<typeof AssessResponseSchema>;

/** Gói âm thanh dựng sẵn cho một unit (hoặc 'tones') theo một miền. Khóa = văn bản đã NFC + trim. */
export const AudioPackSchema = z.object({
  version: z.literal(1),
  pack: z.string().regex(/^[\w-]{1,40}$/),
  dialect: DialectSchema,
  model: z.string(),
  voice: z.string(),
  items: z.record(z.string().min(1).max(500), z.string().regex(/^[a-f0-9]{64}$/))
});
export type AudioPack = z.infer<typeof AudioPackSchema>;

// POST /practice/explain
export const ExplainRequestSchema = z.object({
  kind: z.enum(['choice', 'build', 'speak', 'tone']),
  /** đề bài người học thấy */
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(200),
  /** câu trả lời của người học (rỗng nếu bỏ qua) */
  userAnswer: z.string().trim().max(200).default(''),
  /** ngôn ngữ của lời giải thích (nội dung tiếng Việt vẫn giữ nguyên) */
  language: z.enum(['vi', 'en']).default('vi')
});
export type ExplainRequest = z.infer<typeof ExplainRequestSchema>;

export const ExplainResponseSchema = z.object({
  explanation: z.string().min(1).max(800),
  tip: z.string().max(300).optional(),
  /** true = lời giải theo mẫu, chưa qua LLM */
  mock: z.boolean(),
  remaining: RemainingSchema.optional(),
  cached: z.boolean()
});
export type ExplainResponse = z.infer<typeof ExplainResponseSchema>;
