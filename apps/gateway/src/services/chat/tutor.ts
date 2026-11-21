import { z } from 'zod';
import { foldVietnamese, type RoleplayScenario } from '@vietlearning/content';
import { AgentUIBlockType, type AgentUIBlock, type ChatHistoryItem } from '@vietlearning/contracts';
import { SystemPromptBuilder } from '@vietlearning/prompts';
import type { LlmProvider, LlmTurn } from '../../providers/llm.js';
import { mockTutorTurn, type TutorInput, type TutorResult } from './mockTutor.js';
import { filterNewWords } from './newWords.js';
import { GatewayError } from '../../pipeline/RequestPipeline.js';

export interface LiveTutorInput extends TutorInput {
  dialect: 'north' | 'central' | 'south';
  level: number;
  explanationLanguage: 'vi' | 'en';
  mode: 'chat' | 'call';
  /** tóm tắt cuộc trò chuyện (≤ 600 ký tự) */
  summary?: string;
  /** ảnh người học cho xem (lượt này đi VISION_CHAIN) */
  image?: { mimeType: 'image/jpeg' | 'image/png'; base64: string };
}

export interface TutorTurn extends TutorResult {
  mock: boolean;
  tokens: number;
  /** nguồn AI đã trả lời (chỉ tên); vắng khi là bộ giả lập */
  provider?: string;
}

/** Schema đầu ra gửi cho LLM (tập con OpenAPI) — khớp với LlmTutorOutput bên dưới */
const OUTPUT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    correction: {
      type: 'OBJECT',
      nullable: true,
      properties: { original: { type: 'STRING' }, corrected: { type: 'STRING' }, explanation: { type: 'STRING' } },
      required: ['original', 'corrected', 'explanation']
    },
    blocks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { type: { type: 'STRING', enum: AgentUIBlockType.options }, title: { type: 'STRING' }, note: { type: 'STRING' } },
        required: ['type', 'title', 'note']
      }
    },
    completedTasks: { type: 'ARRAY', items: { type: 'INTEGER' } },
    newWords: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { vi: { type: 'STRING' }, en: { type: 'STRING' } }, required: ['vi', 'en'] }
    }
  },
  required: ['reply', 'correction', 'blocks', 'completedTasks', 'newWords']
} as const;

/** Nguyên tắc 6: không tin đầu ra LLM — xác thực, cắt độ dài, lọc chỉ số nhiệm vụ ngoài phạm vi */
const LlmTutorOutput = z.object({
  reply: z.string().trim().min(1).max(800),
  correction: z
    .object({ original: z.string().trim().max(500), corrected: z.string().trim().min(1).max(500), explanation: z.string().trim().max(500) })
    .nullable()
    .catch(null),
  blocks: z
    .array(z.object({ type: AgentUIBlockType, title: z.string().trim().min(1).max(80), note: z.string().trim().max(300) }))
    .catch([]),
  completedTasks: z.array(z.number().int()).catch([]),
  newWords: z.array(z.object({ vi: z.string(), en: z.string() })).catch([])
});

/** Mỗi loại block hiển thị một trường văn bản khác nhau (xem AgentBlockView phía client) */
const FIELD: Record<AgentUIBlock['type'], string> = {
  culture_pill: 'tip',
  honorific_card: 'note',
  pitch_visualizer: 'note',
  adaptive_drill: 'note',
  dialect_switch: 'note'
};

function toTurns(history: ChatHistoryItem[], userText: string, image?: LiveTutorInput['image']) {
  const turns: LlmTurn[] = history.map((h) => ({ role: h.role === 'user' ? ('user' as const) : ('model' as const), parts: [{ text: h.text }] }));
  turns.push({ role: 'user', parts: image ? [{ inline: { mimeType: image.mimeType, base64: image.base64 } }, { text: userText }] : [{ text: userText }] });
  // Gemini yêu cầu lượt đầu là user: bỏ các lượt model đứng đầu
  while (turns.length > 1 && turns[0].role === 'model') turns.shift();
  return turns;
}

const skeleton = (s: string) => foldVietnamese(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Gọi thoại: câu người học là bản chép lời tự động, nên lời sửa CHỈ khác dấu thanh / viết hoa / dấu câu là lỗi
 * của bộ chép lời chứ không phải của người học => bỏ (chốt chặn tất định, không chỉ dựa vào prompt — Nguyên tắc 6).
 */
export function dropTranscriptionNoise(turn: TutorTurn, input: Pick<LiveTutorInput, 'mode' | 'userText'>): TutorTurn {
  if (input.mode !== 'call' || !turn.correction) return turn;
  return skeleton(turn.correction.corrected) === skeleton(input.userText) ? { ...turn, correction: undefined } : turn;
}

export interface Tutor {
  readonly live: boolean;
  turn(input: LiveTutorInput): Promise<TutorTurn>;
}

export function createTutor(llm: LlmProvider | null, log?: { warn: (o: object, msg: string) => void }, vision: LlmProvider | null = llm): Tutor {
  const mock = (input: LiveTutorInput): TutorTurn => dropTranscriptionNoise({ ...mockTutorTurn(input), mock: true, tokens: 0 }, input);
  if (!llm) return { live: false, turn: async (input) => mock(input) };

  return {
    live: true,
    async turn(input) {
      // Lượt có ảnh đi VISION_CHAIN; chưa cấu hình vision => bộ giả lập (mock: true), không bịa là AI thật
      const source = input.image ? vision : llm;
      if (!source) return mock(input);
      const scenario: RoleplayScenario | undefined = input.scenario;
      const system = new SystemPromptBuilder()
        .setPersona(input.persona)
        .setLevel(input.level)
        .setDialect(input.dialect)
        .setCorrectionLevel(input.correctionLevel)
        .setExplanationLanguage(input.explanationLanguage)
        .setScenario(scenario ? { title: scenario.title, location: scenario.location, tasks: scenario.tasks } : null)
        .setMode(input.mode)
        .setSummary(input.summary)
        .setHasImage(Boolean(input.image))
        .build();

      try {
        const { json, tokens, provider } = await source.generateJson({
          system,
          turns: toTurns(input.history, input.userText, input.image),
          schema: OUTPUT_SCHEMA,
          maxOutputTokens: input.mode === 'call' ? 300 : 700,
          // JSON sai Zod => chuỗi dự phòng thử nguồn kế (Nguyên tắc 6)
          accept: (j) => LlmTutorOutput.safeParse(j).success
        });
        const out = LlmTutorOutput.parse(json);
        const taskCount = scenario?.tasks.length ?? 0;
        const correction =
          input.correctionLevel !== 'off' && out.correction && out.correction.corrected !== input.userText.trim()
            ? { original: input.userText, corrected: out.correction.corrected, explanation: out.correction.explanation }
            : undefined;
        return dropTranscriptionNoise({
          reply: out.reply,
          correction,
          blocks: scenario
            ? []
            : out.blocks.slice(0, 2).map((b, i) => ({ id: `b-${i}-${b.type}`, type: b.type, title: b.title, payload: { [FIELD[b.type]]: b.note } })),
          completedTasks: [...new Set(out.completedTasks.filter((t) => t >= 0 && t < taskCount))].sort((a, b) => a - b),
          newWords: filterNewWords(out.reply, out.newWords),
          mock: false,
          tokens,
          provider
        }, input);
      } catch (err) {
        // Đã cấu hình AI thật mà hết chuỗi dự phòng: báo `llm_busy` (503) để giao diện hiện "Cu Tít đang bận, thử lại"
        // và nơi gọi hoàn lại lượt. KHÔNG trả lời mẫu trá hình làm AI (mock chỉ dùng khi chưa cấu hình AI).
        log?.warn({ err: (err as Error).message }, 'tutor LLM failed (chain exhausted)');
        if (err instanceof GatewayError) throw err;
        throw new GatewayError(503, 'llm_busy', 'Cu Tít đang bận, thử lại sau ít giây');
      }
    }
  };
}
