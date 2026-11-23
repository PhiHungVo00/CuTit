import { z } from 'zod';
import type { CultureCard } from '@vietlearning/content';
import { TRANSCRIBE_PROMPT, VISION_LABEL_PROMPT, cultureAnswerPrompt } from '@vietlearning/prompts';
import type { LlmProvider } from '../../providers/llm.js';
import { GatewayError } from '../../pipeline/RequestPipeline.js';

/**
 * Các tác vụ AI một lượt (M4 dán nhãn ảnh, M10 hỏi văn hóa, STT cho M1/M7).
 * Mỗi tác vụ: prompt có phiên bản (02-hoi-thoai-ai/packages/prompts) + schema đầu ra + xác thực Zod (Nguyên tắc 6).
 */

// ---------- M4: dán nhãn đồ vật ----------
const VISION_SCHEMA = {
  type: 'OBJECT',
  properties: { items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { vi: { type: 'STRING' }, en: { type: 'STRING' } }, required: ['vi', 'en'] } } },
  required: ['items']
};
const VisionOut = z.object({ items: z.array(z.object({ vi: z.string().trim().min(1).max(60), en: z.string().trim().min(1).max(60) }).passthrough()) });

export async function labelImage(llm: LlmProvider, image: { mimeType: 'image/jpeg' | 'image/png'; base64: string }) {
  const { json, tokens, provider } = await llm.generateJson({
    system: VISION_LABEL_PROMPT,
    turns: [{ role: 'user', parts: [{ inline: { mimeType: image.mimeType, base64: image.base64 } }, { text: 'Liệt kê đồ vật trong ảnh.' }] }],
    schema: VISION_SCHEMA,
    maxOutputTokens: 400,
    temperature: 0.2,
    accept: (j) => VisionOut.safeParse(j).success
  });
  const out = VisionOut.safeParse(json);
  if (!out.success) throw new GatewayError(502, 'llm_bad_output', 'Dịch vụ nhận diện ảnh trả về dữ liệu không hợp lệ');
  // Bỏ trùng theo nhãn tiếng Việt, tối đa 6
  const seen = new Set<string>();
  const items = out.data.items
    .map((i) => ({ vi: i.vi.toLowerCase(), en: i.en.toLowerCase() }))
    .filter((i) => !seen.has(i.vi) && seen.add(i.vi))
    .slice(0, 6);
  return { items, tokens, provider };
}

// ---------- M10: hỏi văn hóa (chỉ dựa trên thẻ đã truy hồi) ----------
const CULTURE_SCHEMA = {
  type: 'OBJECT',
  properties: { answer: { type: 'STRING' }, sources: { type: 'ARRAY', items: { type: 'STRING' } } },
  required: ['answer', 'sources']
};
const CultureOut = z.object({ answer: z.string().trim().min(1).max(1500), sources: z.array(z.string()).catch([]) });

export async function answerCulture(llm: LlmProvider, question: string, cards: CultureCard[], language: 'vi' | 'en') {
  const context = cards.map((c) => (language === 'en' ? `[${c.id}] ${c.titleEn}: ${c.contentEn}` : `[${c.id}] ${c.title}: ${c.content}`)).join('\n');
  const { json, tokens, provider } = await llm.generateJson({
    system: cultureAnswerPrompt(language),
    turns: [{ role: 'user', parts: [{ text: `Thẻ văn hóa:\n${context}\n\nCâu hỏi: ${question}` }] }],
    schema: CULTURE_SCHEMA,
    maxOutputTokens: 500,
    temperature: 0.3,
    accept: (j) => CultureOut.safeParse(j).success
  });
  const out = CultureOut.safeParse(json);
  if (!out.success) throw new GatewayError(502, 'llm_bad_output', 'Dịch vụ AI trả về dữ liệu không hợp lệ');
  const ids = new Set(cards.map((c) => c.id));
  const sources = out.data.sources.filter((s) => ids.has(s));
  return { answer: out.data.answer, sources: sources.length ? sources : cards.map((c) => c.id), tokens, provider };
}

// ---------- STT: chép lời giọng nói ----------
const STT_SCHEMA = {
  type: 'OBJECT',
  properties: { text: { type: 'STRING' }, confidence: { type: 'NUMBER' } },
  required: ['text', 'confidence']
};
const SttOut = z.object({ text: z.string().trim().max(500), confidence: z.number().min(0).max(1).catch(0.5) });

/** Định dạng âm thanh nhà cung cấp nhận được (webm/Opus không được hỗ trợ: client gửi WAV) */
const STT_MIME: Record<string, string> = { 'audio/wav': 'audio/wav', 'audio/x-wav': 'audio/wav', 'audio/wave': 'audio/wav', 'audio/ogg': 'audio/ogg' };

export async function transcribe(llm: LlmProvider, audio: { bytes: Buffer; mimetype: string }, timeoutMs?: number) {
  const mimeType = STT_MIME[audio.mimetype];
  if (!mimeType) throw new GatewayError(415, 'unsupported_audio_type', 'Nhận dạng giọng nói cần âm thanh WAV hoặc OGG');
  const { json, tokens } = await llm.generateJson({
    system: TRANSCRIBE_PROMPT,
    turns: [{ role: 'user', parts: [{ inline: { mimeType, base64: audio.bytes.toString('base64') } }, { text: 'Chép lời đoạn âm thanh.' }] }],
    schema: STT_SCHEMA,
    maxOutputTokens: 300,
    temperature: 0,
    timeoutMs,
    accept: (j) => SttOut.safeParse(j).success
  });
  const out = SttOut.safeParse(json);
  if (!out.success) throw new GatewayError(502, 'llm_bad_output', 'Dịch vụ nhận dạng giọng nói trả về dữ liệu không hợp lệ');
  return { ...out.data, tokens };
}
