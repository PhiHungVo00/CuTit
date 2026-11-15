import { z } from 'zod';
import type { RoleplayScenario } from '@vietlearning/content';
import { AgentUIBlockType, type AgentUIBlock, type ChatHistoryItem } from '@vietlearning/contracts';
import { SystemPromptBuilder } from '@vietlearning/prompts';
import type { LlmProvider } from '../../providers/llm.js';
import { mockTutorTurn, type TutorInput, type TutorResult } from './mockTutor.js';

export interface LiveTutorInput extends TutorInput {
  dialect: 'north' | 'central' | 'south';
  level: number;
  explanationLanguage: 'vi' | 'en';
}

export interface TutorTurn extends TutorResult {
  mock: boolean;
  tokens: number;
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
    completedTasks: { type: 'ARRAY', items: { type: 'INTEGER' } }
  },
  required: ['reply', 'correction', 'blocks', 'completedTasks']
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
  completedTasks: z.array(z.number().int()).catch([])
});

/** Mỗi loại block hiển thị một trường văn bản khác nhau (xem AgentBlockView phía client) */
const FIELD: Record<AgentUIBlock['type'], string> = {
  culture_pill: 'tip',
  honorific_card: 'note',
  pitch_visualizer: 'note',
  adaptive_drill: 'note',
  dialect_switch: 'note'
};

function toTurns(history: ChatHistoryItem[], userText: string) {
  const turns = history.map((h) => ({ role: h.role === 'user' ? ('user' as const) : ('model' as const), parts: [{ text: h.text }] }));
  turns.push({ role: 'user', parts: [{ text: userText }] });
  // Gemini yêu cầu lượt đầu là user: bỏ các lượt model đứng đầu
  while (turns.length > 1 && turns[0].role === 'model') turns.shift();
  return turns;
}

export interface Tutor {
  readonly live: boolean;
  turn(input: LiveTutorInput): Promise<TutorTurn>;
}

export function createTutor(llm: LlmProvider | null, log?: { warn: (o: object, msg: string) => void }): Tutor {
  const mock = (input: LiveTutorInput): TutorTurn => ({ ...mockTutorTurn(input), mock: true, tokens: 0 });
  if (!llm) return { live: false, turn: async (input) => mock(input) };

  return {
    live: true,
    async turn(input) {
      const scenario: RoleplayScenario | undefined = input.scenario;
      const system = new SystemPromptBuilder()
        .setPersona(input.persona)
        .setLevel(input.level)
        .setDialect(input.dialect)
        .setCorrectionLevel(input.correctionLevel)
        .setExplanationLanguage(input.explanationLanguage)
        .setScenario(scenario ? { title: scenario.title, location: scenario.location, tasks: scenario.tasks } : null)
        .build();

      try {
        const { json, tokens } = await llm.generateJson({ system, turns: toTurns(input.history, input.userText), schema: OUTPUT_SCHEMA, maxOutputTokens: 700 });
        const out = LlmTutorOutput.parse(json);
        const taskCount = scenario?.tasks.length ?? 0;
        const correction =
          input.correctionLevel !== 'off' && out.correction && out.correction.corrected !== input.userText.trim()
            ? { original: input.userText, corrected: out.correction.corrected, explanation: out.correction.explanation }
            : undefined;
        return {
          reply: out.reply,
          correction,
          blocks: scenario
            ? []
            : out.blocks.slice(0, 2).map((b, i) => ({ id: `b-${i}-${b.type}`, type: b.type, title: b.title, payload: { [FIELD[b.type]]: b.note } })),
          completedTasks: [...new Set(out.completedTasks.filter((t) => t >= 0 && t < taskCount))].sort((a, b) => a - b),
          mock: false,
          tokens
        };
      } catch (err) {
        // AI lỗi/quá hạn/đầu ra sai: vẫn trả lời bằng bộ giả lập, gắn mock: true để giao diện báo trung thực
        log?.warn({ err: (err as Error).message }, 'tutor LLM failed, falling back to mock');
        return mock(input);
      }
    }
  };
}
