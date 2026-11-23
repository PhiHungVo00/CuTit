import { z } from 'zod';

export const AgentUIBlockType = z.enum([
  'pitch_visualizer',
  'honorific_card',
  'adaptive_drill',
  'culture_pill',
  'dialect_switch'
]);

export const AgentUIBlockSchema = z.object({
  id: z.string(),
  type: AgentUIBlockType,
  title: z.string(),
  payload: z.record(z.any())
});

/** Một lượt cũ gửi kèm để LLM có ngữ cảnh (client giữ tối đa 10 lượt gần nhất) */
export const ChatHistoryItemSchema = z.object({
  role: z.enum(['user', 'tutor']),
  text: z.string().max(500)
});

export const VoiceTurnRequestSchema = z
  .object({
    sessionId: z.string().uuid(),
    /** @deprecated Gửi âm thanh qua multipart ở /speech/transcribe rồi dùng userText; base64 tốn thêm ~33% dữ liệu */
    userAudioBase64: z.string().optional(),
    userText: z.string().trim().min(1).max(500).optional(),
    targetDialect: z.enum(['north', 'central', 'south']).default('north'),
    learnerLevel: z.number().int().min(1).max(6).default(1),
    /** M7: id kịch bản nhập vai (vd. "sc3"); bỏ trống = trò chuyện tự do (M1) */
    scenarioId: z.string().max(32).optional(),
    /** M12: mức sửa lỗi và nhân vật gia sư */
    correctionLevel: z.enum(['gentle', 'strict', 'off']).default('gentle'),
    persona: z.string().max(32).default('be_cu_tit'),
    history: z.array(ChatHistoryItemSchema).max(10).default([]),
    /** Bản tóm tắt cuộc trò chuyện (≤ 600 ký tự) do /chat/summarize viết; thay cho phần lịch sử cũ hơn 10 lượt */
    summary: z.string().trim().max(600).optional(),
    /** Ảnh JPEG/PNG base64 (≤ 150 KB sau base64 theo luật client; trần 200 KB) — lượt có ảnh đi VISION_CHAIN, trừ thêm 1 `visionImages` */
    imageBase64: z.string().max(204800).optional(),
    /** Ngôn ngữ giao diện của người học: lời giải thích lỗi viết bằng ngôn ngữ này (câu mẫu vẫn là tiếng Việt) */
    explanationLanguage: z.enum(['vi', 'en']).default('vi'),
    /** GĐ3: 'call' = gọi thoại — userText là bản chép lời giọng nói, gia sư trả lời văn nói ngắn */
    mode: z.enum(['chat', 'call']).default('chat')
  })
  .refine((b) => b.userText || b.userAudioBase64, { message: 'Cần userText hoặc userAudioBase64' });

/** POST /chat/summarize: viết lại bản tóm tắt cuộc trò chuyện (không trừ lượt người dùng, tính vào trần chung) */
export const ChatSummarizeRequestSchema = z.object({
  sessionId: z.string().uuid(),
  previousSummary: z.string().trim().max(600).optional(),
  history: z.array(ChatHistoryItemSchema).min(1).max(20),
  explanationLanguage: z.enum(['vi', 'en']).default('vi')
});
export const ChatSummarizeResponseSchema = z.object({
  summary: z.string().trim().min(1).max(600),
  remaining: z.lazy(() => RemainingSchema).optional()
});

/** Một lỗi đã sửa trong lượt (để tổng kết cuối buổi nhập vai) */
export const ChatCorrectionSchema = z.object({
  original: z.string().max(500),
  corrected: z.string().max(500),
  explanation: z.string().max(500)
});

/** GĐ3: từ mới xuất hiện trong câu trả lời (để tổng kết + thêm vào ôn tập) */
export const NewWordSchema = z.object({
  vi: z.string().min(1).max(40),
  en: z.string().min(1).max(80)
});

/**
 * Sự kiện SSE của POST /chat/turn (Accept: text/event-stream). Thứ tự: transcript → token* → correction? → blocks? → done.
 * Lỗi giữa luồng: sự kiện error rồi đóng luồng. Mỗi sự kiện được Gateway kiểm tra bằng schema này trước khi gửi.
 */
export const ChatEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('transcript'), text: z.string() }),
  z.object({ type: z.literal('token'), text: z.string() }),
  z.object({ type: z.literal('correction'), correction: ChatCorrectionSchema }),
  z.object({ type: z.literal('blocks'), blocks: z.array(AgentUIBlockSchema).max(4) }),
  z.object({
    type: z.literal('done'),
    turnId: z.string().uuid(),
    reply: z.string(),
    audioUrl: z.string().url().optional(),
    /** M7: chỉ số nhiệm vụ của kịch bản đã hoàn thành (tính đến lượt này, do Gateway/LLM chấm) */
    completedTasks: z.array(z.number().int().min(0).max(9)).default([]),
    /** true nếu câu trả lời do bộ giả lập sinh (chưa nối LLM thật) */
    mock: z.boolean().default(false),
    /** GĐ3: từ mới trong câu trả lời (Gateway đã lọc: phải có trong reply, có nghĩa) */
    newWords: z.array(NewWordSchema).max(5).default([]),
    /** GĐ3: số lượt hội thoại AI còn lại hôm nay (theo ngày giờ Việt Nam). Giữ để tương thích; dùng `remaining.turns` */
    turnsLeft: z.number().int().min(0).optional(),
    /** Hạn mức còn lại hôm nay (lượt lỗi AI không bị trừ) */
    remaining: z.lazy(() => RemainingSchema).optional()
  }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string().optional() })
]);

export const VoiceTurnResponseSchema = z.object({
  turnId: z.string().uuid(),
  transcript: z.string(),
  correctedText: z.string().optional(),
  explanation: z.string().optional(),
  audioUrl: z.string().url().optional(),
  uiBlocks: z.array(AgentUIBlockSchema).default([]),
  remaining: z.lazy(() => RemainingSchema).optional()
});

export type AgentUIBlock = z.infer<typeof AgentUIBlockSchema>;
export type VoiceTurnRequest = z.infer<typeof VoiceTurnRequestSchema>;
export type VoiceTurnResponse = z.infer<typeof VoiceTurnResponseSchema>;
export type ChatSummarizeRequest = z.input<typeof ChatSummarizeRequestSchema>;
export type ChatSummarizeResponse = z.infer<typeof ChatSummarizeResponseSchema>;
export type ChatEvent = z.infer<typeof ChatEventSchema>;
export type ChatCorrection = z.infer<typeof ChatCorrectionSchema>;
const QuotaCounterSchema = z.object({ used: z.number().int().min(0), limit: z.number().int().min(0) });

/**
 * Số lượt/đơn vị AI CÒN LẠI hôm nay của người dùng (đã trừ phần đã dùng; không âm). Gateway đính kèm vào kết quả
 * mọi route AI (chat/turn, speech, vision, culture, explain) để giao diện hiện "Còn N lượt" mà không gọi thêm /v1/quota.
 * Ngày hạn mức tính theo giờ Việt Nam (UTC+7): đổi ngày lúc 00:00 giờ Việt Nam.
 */
export const RemainingSchema = z.object({
  turns: z.number().int().min(0),
  llmTokens: z.number().int().min(0),
  sttSeconds: z.number().int().min(0),
  visionImages: z.number().int().min(0)
});

/** GĐ3: GET /v1/quota — hạn mức AI hôm nay (ngày theo giờ Việt Nam; resetAt = 00:00 giờ Việt Nam kế tiếp) */
export const QuotaStatusSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  resetAt: z.string().datetime(),
  turns: QuotaCounterSchema,
  llmTokens: QuotaCounterSchema,
  sttSeconds: QuotaCounterSchema
});

/**
 * Thân lỗi 429 khi hết hạn mức ngày (rate-limit theo phút dùng mã khác).
 * `scope: 'global'` = trần dùng chung của CẢ APP hôm nay đã hết (không phải lỗi của riêng người dùng);
 * vắng `scope` = hết hạn mức riêng của người dùng.
 */
export const QuotaExceededSchema = z.object({
  error: z.literal('quota_exceeded'),
  capability: z.enum(['turn', 'llm', 'stt', 'tts', 'vision']),
  resetAt: z.string().datetime(),
  scope: z.literal('global').optional(),
  message: z.string().optional()
});

/**
 * Thân lỗi 503 khi AI tạm bận: MỌI nguồn trong chuỗi dự phòng đều lỗi/quá tải/ngắt mạch. Khác `quota_exceeded`:
 * KHÔNG trừ lượt của người dùng; client hiện "Cu Tít đang bận, thử lại" kèm nút Thử lại.
 */
export const LlmBusySchema = z.object({
  error: z.literal('llm_busy'),
  /** gợi ý chờ bao lâu (giây) trước khi thử lại */
  retryAfterSec: z.number().int().min(1).optional(),
  message: z.string().optional()
});

export type QuotaStatus = z.infer<typeof QuotaStatusSchema>;
export type Remaining = z.infer<typeof RemainingSchema>;
export type NewWord = z.infer<typeof NewWordSchema>;
export type ChatHistoryItem = z.infer<typeof ChatHistoryItemSchema>;
