import { z } from 'zod';
import type { ChatSummarizeRequest } from '@vietlearning/contracts';
import { summarizePrompt } from '@vietlearning/prompts';
import type { LlmProvider } from '../../providers/llm.js';
import { GatewayError } from '../../pipeline/RequestPipeline.js';

const SUMMARY_SCHEMA = { type: 'OBJECT', properties: { summary: { type: 'STRING' } }, required: ['summary'] } as const;
/** Nguyên tắc 6: tóm tắt dài quá 600 ký tự bị coi là sai (thử nguồn kế), không tự cắt làm mất nghĩa */
const SummaryOut = z.object({ summary: z.string().trim().min(1).max(600) });

export async function summarizeConversation(llm: LlmProvider, req: Pick<ChatSummarizeRequest, 'previousSummary' | 'history'> & { explanationLanguage: 'vi' | 'en' }) {
  const transcript = req.history.map((h) => `${h.role === 'user' ? 'Người học' : 'Gia sư'}: ${h.text}`).join('\n');
  const text = `${req.previousSummary ? `Tóm tắt cũ: ${req.previousSummary}\n\n` : ''}Hội thoại mới:\n${transcript}`;
  const { json, tokens, provider } = await llm.generateJson({
    system: summarizePrompt(req.explanationLanguage),
    turns: [{ role: 'user', parts: [{ text }] }],
    schema: SUMMARY_SCHEMA,
    maxOutputTokens: 300,
    temperature: 0.2,
    accept: (j) => SummaryOut.safeParse(j).success
  });
  const out = SummaryOut.safeParse(json);
  if (!out.success) throw new GatewayError(502, 'llm_bad_output', 'Dịch vụ AI trả về bản tóm tắt không hợp lệ');
  return { summary: out.data.summary, tokens, provider };
}
