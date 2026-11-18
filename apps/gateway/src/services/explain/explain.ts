import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ExplainRequest, ExplainResponse } from '@vietlearning/contracts';
import { EXPLAIN_PROMPT_VERSION, explainAnswerPrompt } from '@vietlearning/prompts';
import type { LlmProvider } from '../../providers/llm.js';
import { GatewayError } from '../../pipeline/RequestPipeline.js';

/**
 * “Giải thích câu trả lời” (GĐ2): LLM trả JSON theo schema, xác thực Zod (Nguyên tắc 6), UI hiển thị chữ thuần.
 * Cache theo câu (đề + đáp án + câu trả lời + ngôn ngữ + phiên bản prompt) trong RAM, LRU 500 mục — câu hỏi khóa học
 * lặp lại giữa người học nên phần lớn lượt không tốn token. Không thêm bảng DB (tránh trùng số migration với phiên khác).
 */
const SCHEMA = {
  type: 'OBJECT',
  properties: { explanation: { type: 'STRING' }, tip: { type: 'STRING' } },
  required: ['explanation']
};
const Out = z.object({
  explanation: z.string().trim().min(1).max(800),
  tip: z.string().trim().max(300).optional().catch(undefined)
});

export function explainKey(req: ExplainRequest): string {
  const canon = [EXPLAIN_PROMPT_VERSION, req.kind, req.question, req.answer, req.userAnswer, req.language].map((x) => x.normalize('NFC').trim()).join('\u0000');
  return createHash('sha256').update(canon, 'utf8').digest('hex');
}

export class ExplainCache {
  private map = new Map<string, { explanation: string; tip?: string }>();
  constructor(private readonly max = 500) {}
  get(key: string) {
    const v = this.map.get(key);
    if (v) {
      this.map.delete(key);
      this.map.set(key, v); // làm mới thứ tự LRU
    }
    return v;
  }
  set(key: string, v: { explanation: string; tip?: string }) {
    this.map.delete(key);
    this.map.set(key, v);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
  }
}

/** Lời giải theo mẫu khi chưa có AI (mock: true) */
export function mockExplain(req: ExplainRequest): { explanation: string } {
  const en = req.language === 'en';
  const wrong = req.userAnswer && req.userAnswer.normalize('NFC') !== req.answer.normalize('NFC');
  const explanation = en
    ? `The correct answer is “${req.answer}”.${wrong ? ` You answered “${req.userAnswer}”.` : ''} Detailed AI explanations aren’t connected yet.`
    : `Đáp án đúng là “${req.answer}”.${wrong ? ` Bạn đã trả lời “${req.userAnswer}”.` : ''} Giải thích chi tiết bằng AI chưa được nối.`;
  return { explanation };
}

export async function explainAnswer(llm: LlmProvider, req: ExplainRequest): Promise<{ explanation: string; tip?: string; tokens: number }> {
  const { json, tokens } = await llm.generateJson({
    system: explainAnswerPrompt(req.language),
    turns: [
      {
        role: 'user',
        parts: [{ text: `Dạng bài: ${req.kind}\nĐề bài: ${req.question}\nĐáp án đúng: ${req.answer}\nCâu trả lời của người học: ${req.userAnswer || '(bỏ trống)'}` }]
      }
    ],
    schema: SCHEMA,
    maxOutputTokens: 400,
    temperature: 0.3
  });
  const out = Out.safeParse(json);
  if (!out.success) throw new GatewayError(502, 'llm_bad_output', 'Dịch vụ AI trả về lời giải không hợp lệ');
  return { explanation: out.data.explanation, ...(out.data.tip ? { tip: out.data.tip } : {}), tokens };
}

export type { ExplainResponse };
