import { z } from 'zod';
import { HandleSchema } from './account.js';
import { CallClientFrameSchemas, CallServerFrameSchemas } from './calls.js';

/**
 * Dự án 4 — Bạn bè: chat, nhóm, thông báo đẩy, khung WebSocket. CONTRACT-FIRST.
 * Spec: docs/superpowers/specs/2026-11-25-ban-be-design.md (5.3 dữ liệu, 5.4 REST, 5.6 WebSocket, 6 nhóm).
 * Tên tệp `chat-social` để không trùng `chat.ts` của chat AI (Bé Cu Tít).
 *
 * Quy ước: mọi thân/khung nhận từ client dùng `.strict()` (từ chối trường lạ); mọi chuỗi có giới hạn độ dài.
 * KHÔNG có trường nào mang năm/ngày sinh. Gửi tin LUÔN bằng REST (không có khung WS "gửi tin").
 */

// ---------- Hằng số (không rải số ma thuật) ----------
export const CHAT_LIMITS = {
  bodyMax: 4000,
  perConvPer10s: 20,
  perUserPerMin: 120,
  perUserPerDay: 600,
  imagesPerDay: 30,
  voicePerDay: 30,
  groupsPerDay: 5,
  friendRequestsPerDay: 20,
  badHandleLookupsPerHour: 10,
  reportsPerDay: 10,
  imageBytes: 2 * 2 ** 20,
  imageMaxEdge: 1280,
  voiceBytes: 3 * 2 ** 20,
  voiceMs: 120_000,
  waveformMax: 64,
  pageDefault: 40,
  pageMax: 100,
  groupTitleMax: 60,
  reportNoteMax: 500,
  snapshotMax: 30,
  unattachedTtlMs: 3_600_000
} as const;

export const WS_LIMITS = {
  helloTimeoutMs: 5000,
  frameMaxBytes: 16 * 1024,
  framesPerSec: 30,
  connectionsPerUser: 3,
  pingMs: 25_000,
  pongTimeoutMs: 60_000,
  sendBufferMax: 1 * 2 ** 20
} as const;

/** Mã đóng WebSocket (4xxx) */
export const WsCloseCode = {
  unauthorized: 4401,
  forbidden: 4403,
  updateRequired: 4426,
  tooManyFrames: 4429
} as const;

// ---------- Mã lỗi (trường `error` của thân lỗi Gateway) ----------
export const ChatErrorCode = {
  ageRequired: 'age_required',
  adultRequired: 'adult_required',
  ageLocked: 'age_locked',
  chatRestricted: 'chat_restricted',
  chatRate: 'chat_rate',
  chatDuplicate: 'chat_duplicate',
  notAMember: 'not_a_member',
  peerUnavailable: 'peer_unavailable',
  blocked: 'blocked',
  attachmentInvalid: 'attachment_invalid',
  storageFull: 'storage_full',
  groupFull: 'group_full',
  messageNotFound: 'message_not_found',
  conversationNotFound: 'conversation_not_found',
  forbidden: 'forbidden',
  reportLimit: 'report_limit',
  // trùng giá trị với FriendErrorCode (friends.ts) để client xử lý một chỗ
  handleRequired: 'handle_required',
  handleTaken: 'handle_taken',
  handleNotFound: 'handle_not_found',
  handleCooldown: 'handle_cooldown',
  requestLimit: 'request_limit'
} as const;
export type ChatErrorCodeValue = (typeof ChatErrorCode)[keyof typeof ChatErrorCode];

// ---------- Phần dùng chung ----------
const Uuid = z.string().uuid();
const Iso = z.string().datetime();

export const ConversationKindSchema = z.enum(['dm', 'group']);
export const MessageKindSchema = z.enum(['text', 'image', 'voice', 'system']);
/** Loại tin client được phép gửi (không có 'system') */
export const ClientMessageKindSchema = z.enum(['text', 'image', 'voice']);
export const GroupRoleSchema = z.enum(['owner', 'admin', 'member']);
export const AttachmentMediaSchema = z.enum(['image', 'voice']);

export const IMAGE_CONTENT_TYPES = ['image/webp', 'image/jpeg', 'image/png'] as const;
export const VOICE_CONTENT_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4'] as const;

/** Người khác chỉ thấy id + tên hiển thị (không email, không handle) */
export const ChatUserRefSchema = z.object({ id: Uuid, displayName: z.string().max(100) });
export type ChatUserRef = z.infer<typeof ChatUserRefSchema>;

// ---------- Handle + cài đặt riêng tư ----------
export const SocialSettingsSchema = z.object({
  discoverable: z.boolean(),
  showOnline: z.boolean(),
  showReadReceipts: z.boolean(),
  showPushPreview: z.boolean()
});
export type SocialSettings = z.infer<typeof SocialSettingsSchema>;
export const SocialSettingsUpdateSchema = SocialSettingsSchema.partial().strict();

// PUT /v1/chat/handle (HandleSchema ở account.ts, dùng chung với friends.ts)
export const HandleSetRequestSchema = z.object({ handle: HandleSchema }).strict();
export const HandleSetResponseSchema = z.object({ handle: z.string() });

export const CHAT_INELIGIBLE_REASONS = ['guest', 'pending_deletion', 'minor', 'age_unknown', 'no_handle', 'restricted'] as const;
export const ChatIneligibleReasonSchema = z.enum(CHAT_INELIGIBLE_REASONS);
/** GET /v1/chat/settings */
export const SocialMeSchema = z.object({
  handle: z.string().nullable(),
  /** gợi ý: tên đăng nhập (tài khoản mật khẩu) */
  suggestedHandle: z.string().nullable(),
  /** vì sao chưa chat được; null = đủ điều kiện */
  ineligible: ChatIneligibleReasonSchema.nullable(),
  settings: SocialSettingsSchema
});

// ---------- Tệp đính kèm ----------
export const AttachmentUploadResponseSchema = z.object({ attachmentId: Uuid });
export const AttachmentUrlResponseSchema = z.object({ url: z.string().max(2048), expiresAt: Iso });

export const WaveformSchema = z.array(z.number().int().min(0).max(255)).max(CHAT_LIMITS.waveformMax);
export const MessageAttachmentSchema = z.object({
  id: Uuid,
  media: AttachmentMediaSchema,
  durationMs: z.number().int().min(0).max(CHAT_LIMITS.voiceMs).optional(),
  waveform: WaveformSchema.optional(),
  width: z.number().int().positive().max(CHAT_LIMITS.imageMaxEdge).optional(),
  height: z.number().int().positive().max(CHAT_LIMITS.imageMaxEdge).optional()
});

/** Tin hệ thống: server KHÔNG lưu chữ tiếng nào; client dựng chữ vi/en từ `type` */
export const SystemEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('group_created'), byUserId: Uuid }),
  z.object({ type: z.literal('member_added'), userId: Uuid, byUserId: Uuid }),
  z.object({ type: z.literal('member_removed'), userId: Uuid, byUserId: Uuid }),
  z.object({ type: z.literal('member_left'), userId: Uuid }),
  z.object({ type: z.literal('title_changed'), byUserId: Uuid, title: z.string().max(CHAT_LIMITS.groupTitleMax) }),
  z.object({ type: z.literal('call_missed'), callId: Uuid, kind: z.enum(['voice', 'video']) }),
  z.object({ type: z.literal('call_ended'), callId: Uuid, kind: z.enum(['voice', 'video']), durationSec: z.number().int().nonnegative() })
]);
export type SystemEvent = z.infer<typeof SystemEventSchema>;

// ---------- Tin nhắn ----------
export const MessageSchema = z.object({
  id: Uuid,
  cid: Uuid,
  seq: z.number().int().positive(),
  /** vắng khi tin hệ thống / người gửi đã xóa tài khoản / tin của người đã chặn */
  sender: ChatUserRefSchema.optional(),
  kind: MessageKindSchema,
  /** vắng khi thu hồi (với người khác) / bị chặn / tệp */
  body: z.string().max(CHAT_LIMITS.bodyMax).optional(),
  attachment: MessageAttachmentSchema.optional(),
  system: SystemEventSchema.optional(),
  createdAt: Iso,
  /** thu hồi hoặc người gửi đã xóa tài khoản (không có nội dung cho người khác) */
  deleted: z.boolean().optional(),
  /** "Tin của người bạn đã chặn": không có nội dung */
  blocked: z.boolean().optional(),
  mine: z.boolean()
});
export type Message = z.infer<typeof MessageSchema>;

/**
 * POST /v1/chat/conversations/:id/messages. Đúng một nội dung theo `kind`:
 * text ⇒ body 1–4000 (không toàn khoảng trắng) và KHÔNG attachmentId; image/voice ⇒ attachmentId (uuid) và KHÔNG body.
 * Client không gửi được 'system'.
 */
export const SendMessageRequestSchema = z.discriminatedUnion('kind', [
  z
    .object({
      clientMsgId: Uuid,
      kind: z.literal('text'),
      body: z
        .string()
        .min(1)
        .max(CHAT_LIMITS.bodyMax)
        .refine((s) => s.trim().length > 0, 'Tin trống')
    })
    .strict(),
  z.object({ clientMsgId: Uuid, kind: z.literal('image'), attachmentId: Uuid }).strict(),
  z.object({ clientMsgId: Uuid, kind: z.literal('voice'), attachmentId: Uuid }).strict()
]);
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

export const SendMessageResponseSchema = z.object({
  id: Uuid,
  seq: z.number().int().positive(),
  createdAt: Iso,
  /** true khi gửi lại cùng clientMsgId và tin đã có (không tạo mới, không tăng seq) */
  duplicate: z.boolean().optional()
});

// GET /v1/chat/conversations/:id/messages?beforeSeq=&afterSeq=&limit=
const SeqQuery = z.coerce.number().int().positive();
export const MessagesQuerySchema = z
  .object({
    beforeSeq: SeqQuery.optional(),
    afterSeq: SeqQuery.optional(),
    limit: z.coerce.number().int().min(1).max(CHAT_LIMITS.pageMax).default(CHAT_LIMITS.pageDefault)
  })
  .refine((q) => !(q.beforeSeq !== undefined && q.afterSeq !== undefined), 'Chỉ một trong beforeSeq/afterSeq');
export const MessagePageSchema = z.object({
  messages: z.array(MessageSchema).max(CHAT_LIMITS.pageMax),
  hasMore: z.boolean()
});
export type MessagePage = z.infer<typeof MessagePageSchema>;

export const ReadRequestSchema = z.object({ seq: z.number().int().positive() }).strict();
export const MessageIdParamsSchema = z.object({ id: Uuid });
export const ConversationIdParamsSchema = z.object({ id: Uuid });
export const MuteRequestSchema = z.object({ mutedUntil: Iso.nullable() }).strict();

// ---------- Cuộc trò chuyện ----------
export const ConversationSchema = z.object({
  id: Uuid,
  kind: ConversationKindSchema,
  title: z.string().max(CHAT_LIMITS.groupTitleMax).nullable(),
  /** 1-1: người kia */
  peer: z.object({ id: Uuid, displayName: z.string().max(100), online: z.boolean().optional() }).optional(),
  memberCount: z.number().int().nonnegative().optional(),
  lastSeq: z.number().int().nonnegative(),
  lastMessage: z
    .object({ seq: z.number().int().positive(), kind: MessageKindSchema, preview: z.string().max(120).optional(), createdAt: Iso })
    .optional(),
  unread: z.number().int().nonnegative(),
  muted: z.boolean(),
  myRole: GroupRoleSchema.optional()
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const ConversationsQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(CHAT_LIMITS.pageMax).default(CHAT_LIMITS.pageDefault)
});
export const ConversationListSchema = z.object({
  conversations: z.array(ConversationSchema).max(CHAT_LIMITS.pageMax),
  nextCursor: z.string().max(200).nullable()
});

/** POST /v1/chat/conversations: tạo nhóm, hoặc tạo/lấy 1-1 theo quan hệ bạn bè */
const uniqueIds = (ids: string[]) => new Set(ids).size === ids.length;
export const GroupCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(CHAT_LIMITS.groupTitleMax),
    memberIds: z.array(Uuid).min(1).max(1000).refine(uniqueIds, 'Trùng thành viên')
  })
  .strict();
export const DmCreateSchema = z.object({ peerFriendshipId: Uuid }).strict();
export const ConversationCreateRequestSchema = z.union([GroupCreateSchema, DmCreateSchema]);

export const GroupMemberChangeSchema = z.object({ memberIds: z.array(Uuid).min(1).max(100).refine(uniqueIds, 'Trùng thành viên') }).strict();
export const GroupMemberParamsSchema = z.object({ id: Uuid, userId: Uuid });
export const GroupTitleRequestSchema = z.object({ title: z.string().trim().min(1).max(CHAT_LIMITS.groupTitleMax) }).strict();
export const GroupRoleRequestSchema = z.object({ role: z.enum(['admin', 'member']) }).strict();
export const GroupLeaveRequestSchema = z.object({ successorId: Uuid.optional() }).strict();

export const GroupMemberSchema = z.object({ id: Uuid, displayName: z.string().max(100), role: GroupRoleSchema, joinedAt: Iso });
export const GroupMembersResponseSchema = z.object({ members: z.array(GroupMemberSchema), nextCursor: z.string().max(200).nullable() });

// ---------- Báo cáo ----------
export const REPORT_REASONS = ['spam', 'harassment', 'sexual', 'minor_safety', 'scam', 'other'] as const;
export const ReportReasonSchema = z.enum(REPORT_REASONS);
export const ReportStatusSchema = z.enum(['open', 'reviewing', 'actioned', 'dismissed']);
export const ReportActionSchema = z.enum(['dismiss', 'warn', 'restrict']);

export const ReportCreateSchema = z
  .object({
    conversationId: Uuid,
    messageId: Uuid.optional(),
    reportedUserId: Uuid,
    reason: ReportReasonSchema,
    note: z.string().trim().max(CHAT_LIMITS.reportNoteMax).optional()
  })
  .strict();
export type ReportCreate = z.infer<typeof ReportCreateSchema>;
/** Không cho biết gì về người bị báo cáo */
export const ReportCreateResponseSchema = z.object({ id: Uuid });

// ---------- Thông báo đẩy ----------
export const PushTokenSchema = z
  .object({
    token: z.string().min(20).max(4096),
    platform: z.literal('android'),
    appBuild: z.number().int().min(0).max(2 ** 31 - 1),
    locale: z.enum(['vi', 'en'])
  })
  .strict();
export type PushToken = z.infer<typeof PushTokenSchema>;
export const PushTokenParamsSchema = z.object({ token: z.string().min(20).max(4096) });

/** Gói dữ liệu của thông báo đẩy (deep link becutit://chat/<cid>, becutit://call/<callId>) */
export const PushPayloadSchema = z.object({
  type: z.enum(['msg', 'call', 'friend', 'feedback']),
  cid: Uuid.optional(),
  callId: Uuid.optional(),
  from: z.string().max(100).optional()
});

// ---------- Khung WebSocket ----------
/** Server → client (kiểm cả ở test hợp đồng lẫn khi Gateway phát) */
export const WsServerFrameSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('hello_ok'), serverTime: Iso, expSec: z.number().int().positive() }).strict(),
  z.object({ t: z.literal('auth_expiring'), inSec: z.number().int().nonnegative() }).strict(),
  z.object({ t: z.literal('msg'), message: MessageSchema }).strict(),
  z.object({ t: z.literal('recall'), cid: Uuid, messageId: Uuid, seq: z.number().int().positive() }).strict(),
  z.object({ t: z.literal('restore'), message: MessageSchema }).strict(),
  z.object({ t: z.literal('read'), cid: Uuid, userId: Uuid, seq: z.number().int().positive() }).strict(),
  z.object({ t: z.literal('typing'), cid: Uuid, userId: Uuid }).strict(),
  z.object({ t: z.literal('presence'), userId: Uuid, online: z.boolean() }).strict(),
  z
    .object({ t: z.literal('member'), cid: Uuid, userId: Uuid, change: z.enum(['added', 'removed', 'left', 'role']) })
    .strict(),
  z.object({ t: z.literal('conv'), cid: Uuid, change: z.enum(['created', 'title']) }).strict(),
  z.object({ t: z.literal('friend'), change: z.enum(['request', 'accepted']) }).strict(),
  ...CallServerFrameSchemas,
  z.object({ t: z.literal('error'), code: z.string().max(64), ref: z.string().max(64).optional() }).strict(),
  z.object({ t: z.literal('ping') }).strict()
]);
export type WsServerFrame = z.infer<typeof WsServerFrameSchema>;

const AccessToken = z.string().min(20).max(4096);
/** Khung ĐẦU TIÊN client gửi, trong 5 giây; token KHÔNG nằm trên URL */
export const WsHelloSchema = z
  .object({
    t: z.literal('hello'),
    v: z.literal(1),
    token: AccessToken,
    build: z.number().int().min(0).max(2 ** 31 - 1),
    device: Uuid
  })
  .strict();
export const WsAuthSchema = z.object({ t: z.literal('auth'), token: AccessToken }).strict();

/** Client → server. KHÔNG có khung gửi tin (gửi bằng REST). */
export const WsClientFrameSchema = z.discriminatedUnion('t', [
  WsHelloSchema,
  WsAuthSchema,
  z.object({ t: z.literal('typing'), cid: Uuid }).strict(),
  z.object({ t: z.literal('visibility'), foreground: z.boolean() }).strict(),
  ...CallClientFrameSchemas,
  z.object({ t: z.literal('pong') }).strict()
]);
export type WsClientFrame = z.infer<typeof WsClientFrameSchema>;
