import { z } from 'zod';

/**
 * Dự án 4 — Gọi thoại/video. CONTRACT-FIRST. Spec mục 7 (báo hiệu qua WebSocket, mesh P2P, TURN, đường nâng cấp SFU).
 * Offer/answer/ICE do CLIENT tạo; server chỉ chuyển tiếp `call.signal` (kiểm `to` là thành viên và ≤ 8 KB).
 */

export const CALL_LIMITS = {
  maxParticipants: 6,
  ringMs: 45_000,
  signalMaxBytes: 8 * 1024,
  startsPerHour: 10,
  iceRequestsPerHour: 30,
  turnRelayHoursPerUserPerDay: 3,
  staleCallHours: 6,
  /** gọi trong nhóm lớn: tối đa người được mời đổ chuông */
  inviteMax: 5
} as const;

export const CallErrorCode = {
  callFull: 'call_full',
  callNotFound: 'call_not_found',
  callBusy: 'call_busy',
  turnUnavailable: 'turn_unavailable',
  notAMember: 'not_a_member',
  peerUnavailable: 'peer_unavailable',
  blocked: 'blocked',
  chatRestricted: 'chat_restricted',
  adultRequired: 'adult_required',
  callRate: 'call_rate'
} as const;
export type CallErrorCodeValue = (typeof CallErrorCode)[keyof typeof CallErrorCode];

const Uuid = z.string().uuid();
const Iso = z.string().datetime();

export const CallKindSchema = z.enum(['voice', 'video']);
export const CallModeSchema = z.enum(['mesh', 'sfu']);
export const CALL_END_REASONS = ['hangup', 'no_answer', 'declined', 'busy', 'timeout', 'error'] as const;
export const CallEndReasonSchema = z.enum(CALL_END_REASONS);

// ---------- REST ----------
export const CallParticipantSchema = z.object({
  userId: Uuid,
  displayName: z.string().max(100),
  state: z.enum(['invited', 'joined', 'left', 'declined'])
});
export type CallParticipant = z.infer<typeof CallParticipantSchema>;

/** POST /v1/calls. `inviteIds`: tối đa 5 người được đổ chuông (mặc định mọi người nếu nhóm ≤ 10). */
export const CallStartSchema = z
  .object({
    conversationId: Uuid,
    kind: CallKindSchema,
    inviteIds: z.array(Uuid).max(CALL_LIMITS.inviteMax).optional()
  })
  .strict();
export type CallStart = z.infer<typeof CallStartSchema>;

/** Máy chủ ICE: không bao giờ chứa khóa dài hạn — chỉ thông tin xác thực ngắn hạn (TTL ~1 giờ) */
export const IceServerSchema = z
  .object({
    urls: z.union([z.string().max(300), z.array(z.string().max(300)).max(10)]),
    username: z.string().max(300).optional(),
    credential: z.string().max(300).optional()
  })
  .strict();
export const IceServersSchema = z.array(IceServerSchema).max(10);
export const IceServersResponseSchema = z.object({
  iceServers: IceServersSchema,
  /** false khi hết ngân sách TURN: app vẫn thử P2P trực tiếp */
  relayAvailable: z.boolean(),
  ttlSec: z.number().int().positive()
});

/** Union có phân biệt: mesh bản đầu, sfu (LiveKit) là đường nâng cấp — màn gọi không đổi */
export const CallJoinInfoSchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('mesh'),
      iceServers: IceServersSchema,
      maxParticipants: z.number().int().min(2).max(100)
    })
    .strict(),
  z
    .object({
      mode: z.literal('sfu'),
      url: z.string().url().max(500),
      token: z.string().min(1).max(4096),
      roomName: z.string().min(1).max(200)
    })
    .strict()
]);
export type CallJoinInfo = z.infer<typeof CallJoinInfoSchema>;

export const CallStartResponseSchema = z.object({ callId: Uuid, join: CallJoinInfoSchema });
export const CallJoinResponseSchema = z.object({ join: CallJoinInfoSchema, participants: z.array(CallParticipantSchema) });
export const CallIdParamsSchema = z.object({ id: Uuid });

/** POST /v1/calls/:id/stats — client báo thời gian đi qua relay (kiểm hợp lý ở server, không tin tuyệt đối) */
export const CallStatsSchema = z
  .object({ relaySeconds: z.number().int().min(0).max(CALL_LIMITS.staleCallHours * 3600) })
  .strict();

// ---------- Khung WebSocket `call.*` (gắn vào WsServerFrameSchema / WsClientFrameSchema ở chat-social.ts) ----------
/** Dữ liệu báo hiệu (SDP/ICE) là JSON bất kỳ do client tạo, nhưng TỔNG kích thước ≤ 8 KB (kiểm ở đây, không chỉ ở khung 16 KB) */
/** Số byte UTF-8 của chuỗi (không phụ thuộc TextEncoder/Buffer để chạy được cả trình duyệt lẫn Node) */
export function utf8ByteLength(s: string): number {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}
export const CallSignalDataSchema = z
  .record(z.unknown())
  .refine((d) => utf8ByteLength(JSON.stringify(d)) <= CALL_LIMITS.signalMaxBytes, 'Dữ liệu báo hiệu quá lớn');

export const CallServerFrameSchemas = [
  z
    .object({ t: z.literal('call.invite'), callId: Uuid, cid: Uuid, kind: CallKindSchema, from: z.object({ id: Uuid, displayName: z.string().max(100) }) })
    .strict(),
  z.object({ t: z.literal('call.state'), callId: Uuid, participants: z.array(CallParticipantSchema).max(CALL_LIMITS.maxParticipants) }).strict(),
  z.object({ t: z.literal('call.signal'), callId: Uuid, from: Uuid, data: CallSignalDataSchema }).strict(),
  z.object({ t: z.literal('call.end'), callId: Uuid, reason: CallEndReasonSchema }).strict()
] as const;

export const CallClientFrameSchemas = [
  z.object({ t: z.literal('call.accept'), callId: Uuid }).strict(),
  z.object({ t: z.literal('call.decline'), callId: Uuid }).strict(),
  z.object({ t: z.literal('call.join'), callId: Uuid }).strict(),
  z.object({ t: z.literal('call.leave'), callId: Uuid }).strict(),
  z.object({ t: z.literal('call.signal'), callId: Uuid, to: Uuid, data: CallSignalDataSchema }).strict()
] as const;
