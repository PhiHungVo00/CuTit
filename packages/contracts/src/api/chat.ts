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

export const VoiceTurnRequestSchema = z.object({
  sessionId: z.string().uuid(),
  userAudioBase64: z.string().optional(),
  userText: z.string().optional(),
  targetDialect: z.enum(['north', 'central', 'south']).default('north'),
  learnerLevel: z.number().int().min(1).max(6).default(1)
});

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
