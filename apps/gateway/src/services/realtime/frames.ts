import type { RawData } from 'ws';
import { WsClientFrameSchema, type WsClientFrame, type WsServerFrame } from '@vietlearning/contracts/api';

/**
 * Mã đóng WebSocket ngoài `WsCloseCode` của contract (contract không đổi ở Task này; client Task 6 cần biết):
 * - 4408 im lặng quá hạn pong (nối lại được);  - 4409 bị thay bằng kết nối mới của người đó (KHÔNG tự nối lại ngay: tránh
 *   hai thiết bị đá nhau); - 1013 người nhận chậm (nối lại được); - 1001 Gateway tắt (nối lại lùi dần).
 * Chuẩn: 1003 khung nhị phân, 1007 khung sai (JSON/Zod/`t` lạ), 1008 vi phạm giao thức, 1009 khung quá lớn.
 */
export const WsClose = {
  goingAway: 1001,
  unsupportedData: 1003,
  invalidPayload: 1007,
  policy: 1008,
  tooBig: 1009,
  slowConsumer: 1013,
  timeout: 4408,
  replaced: 4409
} as const;

export type ParseResult = { ok: true; frame: WsClientFrame } | { ok: false; code: number; reason: string };

function byteLength(data: RawData): number {
  if (Array.isArray(data)) return data.reduce((n, b) => n + b.length, 0);
  return data.byteLength;
}

/** Kiểm một khung client: không nhị phân, ≤ maxBytes, JSON đúng, đúng schema (strict) — không bao giờ ném lỗi. */
export function parseClientFrame(data: RawData, isBinary: boolean, maxBytes: number): ParseResult {
  if (isBinary) return { ok: false, code: WsClose.unsupportedData, reason: 'binary_not_supported' };
  if (byteLength(data) > maxBytes) return { ok: false, code: WsClose.tooBig, reason: 'frame_too_large' };
  let json: unknown;
  try {
    const text = Array.isArray(data) ? Buffer.concat(data).toString('utf8') : data.toString('utf8');
    json = JSON.parse(text);
  } catch {
    return { ok: false, code: WsClose.invalidPayload, reason: 'invalid_json' };
  }
  const parsed = WsClientFrameSchema.safeParse(json);
  if (!parsed.success) return { ok: false, code: WsClose.invalidPayload, reason: 'invalid_frame' };
  return { ok: true, frame: parsed.data };
}

export const encodeServerFrame = (frame: WsServerFrame): string => JSON.stringify(frame);
