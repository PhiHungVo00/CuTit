/**
 * GoF Visitor Pattern (22): duyệt danh sách Agent UI Block do LLM sinh ra (qua Gateway)
 * trước khi Host dựng component.
 *
 * Nguyên tắc 6: đầu ra LLM luôn là JSON có cấu trúc, UI KHÔNG render HTML thô.
 * Gateway đã kiểm tra bằng Zod; đây là lớp phòng thủ thứ hai ở client, vì block có thể
 * đến từ cache, từ bản Gateway cũ, hoặc bị chèn nội dung độc (prompt injection).
 *
 *  - SanitizerVisitor: giữ block hợp lệ theo contract, bỏ block sai (không làm hỏng cả lượt),
 *    bỏ key nguy hiểm, chặn URL javascript:/data:, giới hạn độ sâu/độ dài/số phần tử.
 *  - BlockStatsVisitor: đếm loại block (phục vụ analytics), minh họa thêm một visitor.
 */
import { AgentUIBlockSchema, type AgentUIBlock } from '@vietlearning/contracts/api';

export interface BlockVisitor<R> {
  visitBlock(block: AgentUIBlock): R;
}

/** Áp một visitor lên danh sách block thô nhận từ mạng. */
export function visitBlocks<R>(raw: unknown, visitor: BlockVisitor<R>): R[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = AgentUIBlockSchema.safeParse(item);
    return parsed.success ? [visitor.visitBlock(parsed.data)] : [];
  });
}

/** TDD: tối đa 4 khối giao diện trong một lượt thoại */
export const MAX_BLOCKS_PER_TURN = 4;
/** Số cấp object/array lồng nhau tối đa bên trong payload (payload.a.b.c là 3 cấp) */
const MAX_DEPTH = 3;
const MAX_STRING = 2000;
const MAX_ARRAY = 50;
const MAX_KEYS = 30;

/** Key có thể bị dùng để chèn HTML/script hoặc làm ô nhiễm prototype */
const FORBIDDEN_KEY = /^(__proto__|constructor|prototype|dangerouslySetInnerHTML|innerHTML|outerHTML|srcdoc|style|on[A-Za-z].*)$/;
/** Key chứa URL: chỉ cho phép http(s) */
const URL_KEY = /(url|href|src|link|image|audio)$/i;
// Ký tự điều khiển (trừ \t \n) và ký tự định hướng văn bản có thể dùng để giả mạo nội dung
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g;

function cleanString(s: string, key: string): string | undefined {
  const text = s.replace(CONTROL_CHARS, '').normalize('NFC').slice(0, MAX_STRING);
  if (URL_KEY.test(key)) {
    try {
      const u = new URL(text);
      return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : undefined;
    } catch {
      return undefined; // không phải URL tuyệt đối hợp lệ
    }
  }
  return text;
}

function cleanValue(value: unknown, key: string, depth: number): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return cleanString(value, key);
  if (depth >= MAX_DEPTH) return undefined;
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY)
      .map((v) => cleanValue(v, key, depth + 1))
      .filter((v) => v !== undefined);
  }
  if (typeof value === 'object') return cleanRecord(value as Record<string, unknown>, depth + 1);
  return undefined; // function, symbol, bigint...
}

function cleanRecord(obj: Record<string, unknown>, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = Object.create(null);
  for (const [k, v] of Object.entries(obj).slice(0, MAX_KEYS)) {
    if (FORBIDDEN_KEY.test(k)) continue;
    const cleaned = cleanValue(v, k, depth);
    if (cleaned !== undefined) out[k] = cleaned;
  }
  return { ...out }; // trả về object thường (có prototype) cho React
}

export class SanitizerVisitor implements BlockVisitor<AgentUIBlock> {
  visitBlock(block: AgentUIBlock): AgentUIBlock {
    return {
      id: cleanString(block.id, 'id')!.slice(0, 64),
      type: block.type,
      title: cleanString(block.title, 'title')!.slice(0, 120),
      payload: cleanRecord(block.payload, 0)
    };
  }
}

export class BlockStatsVisitor implements BlockVisitor<AgentUIBlock['type']> {
  visitBlock(block: AgentUIBlock) {
    return block.type;
  }
}

/** Điểm vào dùng trong Host: làm sạch + giới hạn số block của một lượt. */
export function sanitizeAgentBlocks(raw: unknown): AgentUIBlock[] {
  return visitBlocks(raw, new SanitizerVisitor()).slice(0, MAX_BLOCKS_PER_TURN);
}
