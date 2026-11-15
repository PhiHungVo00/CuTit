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

/** Một lượt cũ gửi kèm để LLM có ngữ cảnh (client giữ tối đa 6 lượt gần nhất) */
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
    history: z.array(ChatHistoryItemSchema).max(6).default([])
  })
  .refine((b) => b.userText || b.userAudioBase64, { message: 'Cần userText hoặc userAudioBase64' });

/** Một lỗi đã sửa trong lượt (để tổng kết cuối buổi nhập vai) */
export const ChatCorrectionSchema = z.object({
  original: z.string().max(500),
  corrected: z.string().max(500),
  explanation: z.string().max(500)
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
    mock: z.boolean().default(false)
  }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string().optional() })
]);

export const VoiceTurnResponseSchema = z.object({
  turnId: z.string().uuid(),
  transcript: z.string(),
  correctedText: z.string().optional(),
  explanation: z.string().optional(),
  audioUrl: z.string().url().optional(),
  uiBlocks: z.array(AgentUIBlockSchema).default([])
});

export type AgentUIBlock = z.infer<typeof AgentUIBlockSchema>;
export type VoiceTurnRequest = z.infer<typeof VoiceTurnRequestSchema>;
export type VoiceTurnResponse = z.infer<typeof VoiceTurnResponseSchema>;
export type ChatEvent = z.infer<typeof ChatEventSchema>;
export type ChatCorrection = z.infer<typeof ChatCorrectionSchema>;
export type ChatHistoryItem = z.infer<typeof ChatHistoryItemSchema>;
