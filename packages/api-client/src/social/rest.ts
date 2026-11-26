/**
 * Client REST có kiểu của Bạn bè (dự án 4, spec 5.4). Dùng LẠI `request`/`send` của api-client: Bearer qua phiên hiện
 * có, 401 => làm mới rồi gửi lại ĐÚNG một lần, lỗi chuẩn hóa (`GatewayRequestError`, `.code` = mã của Gateway).
 * Mọi thân gửi đi và phản hồi nhận về đều qua Zod của `@vietlearning/contracts/api` (không tự định nghĩa lại).
 * Không giữ khóa bí mật nào.
 */
import type { ZodTypeAny, z } from 'zod';
import {
  AgeDeclareRequestSchema,
  AgeDeclareResponseSchema,
  AttachmentUploadResponseSchema,
  AttachmentUrlResponseSchema,
  CHAT_LIMITS,
  ConversationListSchema,
  ConversationSchema,
  FriendRequestCreateSchema,
  FriendRequestListSchema,
  FriendsResponseSchema,
  GroupCreateSchema,
  GroupLeaveRequestSchema,
  GroupMemberChangeSchema,
  GroupMembersResponseSchema,
  GroupRoleRequestSchema,
  GroupTitleRequestSchema,
  HandleSetRequestSchema,
  HandleSetResponseSchema,
  MessagePageSchema,
  MuteRequestSchema,
  PushTokenSchema,
  ReadRequestSchema,
  ReportCreateResponseSchema,
  ReportCreateSchema,
  SendMessageRequestSchema,
  SendMessageResponseSchema,
  SocialMeSchema,
  SocialSettingsSchema,
  SocialSettingsUpdateSchema,
  CallStartSchema,
  CallStartResponseSchema,
  CallJoinResponseSchema,
  CallStatsSchema,
  IceServersResponseSchema,
  type AgeDeclareResponse,
  type CallStart,
  type Conversation,
  type MessagePage,
  type PushToken,
  type ReportCreate,
  type SendMessageRequest,
  type SocialSettings
} from '@vietlearning/contracts/api';
import { GatewayRequestError, request, send } from '../index.js';

export type SendMessageResponse = z.infer<typeof SendMessageResponseSchema>;

/** Thân gửi đi sai contract => lỗi `invalid-request` NGAY (không gọi mạng); không phản chiếu giá trị đã nhập */
function check<S extends ZodTypeAny>(schema: S, value: unknown, what: string): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new GatewayRequestError('invalid-request', `${what} không hợp lệ`);
  return parsed.data;
}

const enc = encodeURIComponent;
const qs = (q: Record<string, string | number | undefined>): string => {
  const parts = Object.entries(q)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${enc(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

function createSocialRestRaw() {
  /** Gọi route trả 204/thân không quan trọng */
  const act = async (path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown, signal?: AbortSignal): Promise<void> => {
    await send(path, method, body, signal);
  };
  const json = <S extends ZodTypeAny>(path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', schema: S, body?: unknown, signal?: AbortSignal): Promise<z.infer<S>> =>
    request(path, { method, body, schema, signal });

  return {
    // ----- tuổi, handle, cài đặt, chặn (Task 3) -----
    /** Năm sinh chỉ đi một chiều tới Gateway; không lưu, không ghi log, không đưa vào thông báo lỗi */
    declareAge(birthYear: number, signal?: AbortSignal): Promise<AgeDeclareResponse> {
      const body = check(AgeDeclareRequestSchema, { birthYear }, 'Năm sinh');
      return json('/v1/me/age', 'PUT', AgeDeclareResponseSchema, body, signal);
    },
    getSocialMe: (signal?: AbortSignal) => json('/v1/chat/settings', 'GET', SocialMeSchema, undefined, signal),
    async updateSettings(patch: Partial<SocialSettings>, signal?: AbortSignal): Promise<SocialSettings> {
      const body = check(SocialSettingsUpdateSchema, patch, 'Cài đặt');
      const res = await json('/v1/chat/settings', 'PUT', SocialMeSchema.or(SocialSettingsSchema), body, signal);
      return 'settings' in res ? res.settings : res;
    },
    setHandle(handle: string, signal?: AbortSignal) {
      const body = check(HandleSetRequestSchema, { handle }, 'Tên bạn bè');
      return json('/v1/chat/handle', 'PUT', HandleSetResponseSchema, body, signal);
    },
    blockUser: (userId: string, signal?: AbortSignal) => act(`/v1/chat/blocks/${enc(userId)}`, 'PUT', undefined, signal),
    unblockUser: (userId: string, signal?: AbortSignal) => act(`/v1/chat/blocks/${enc(userId)}`, 'DELETE', undefined, signal),

    // ----- bạn bè -----
    listFriends: (today?: string, signal?: AbortSignal) => json(`/v1/friends${qs({ today })}`, 'GET', FriendsResponseSchema, undefined, signal),
    sendFriendRequest(handle: string, signal?: AbortSignal) {
      const body = check(FriendRequestCreateSchema, { handle }, 'Tên bạn bè');
      return act('/v1/friends/requests', 'POST', body, signal);
    },
    listFriendRequests: (signal?: AbortSignal) => json('/v1/friends/requests', 'GET', FriendRequestListSchema, undefined, signal),
    acceptFriendRequest: (id: string, signal?: AbortSignal) => act(`/v1/friends/requests/${enc(id)}/accept`, 'POST', undefined, signal),
    declineFriendRequest: (id: string, signal?: AbortSignal) => act(`/v1/friends/requests/${enc(id)}/decline`, 'POST', undefined, signal),
    setQuestActive: (friendshipId: string, questActive: boolean, signal?: AbortSignal) => act(`/v1/friends/${enc(friendshipId)}/quest-active`, 'POST', { questActive }, signal),

    // ----- cuộc trò chuyện + tin (Task 4) -----
    listConversations(q: { cursor?: string; limit?: number } = {}, signal?: AbortSignal) {
      return json(`/v1/chat/conversations${qs({ cursor: q.cursor, limit: q.limit })}`, 'GET', ConversationListSchema, undefined, signal);
    },
    createDm(peerFriendshipId: string, signal?: AbortSignal): Promise<Conversation> {
      return json('/v1/chat/conversations', 'POST', ConversationSchema, { peerFriendshipId }, signal);
    },
    createGroup(input: { title: string; memberIds: string[] }, signal?: AbortSignal): Promise<Conversation> {
      const body = check(GroupCreateSchema, input, 'Nhóm');
      return json('/v1/chat/conversations', 'POST', ConversationSchema, body, signal);
    },
    listMessages(cid: string, q: { beforeSeq?: number; afterSeq?: number; limit?: number } = {}, signal?: AbortSignal): Promise<MessagePage> {
      if (q.beforeSeq !== undefined && q.afterSeq !== undefined) throw new GatewayRequestError('invalid-request', 'Chỉ một trong beforeSeq/afterSeq');
      const limit = q.limit === undefined ? undefined : Math.min(Math.max(1, Math.floor(q.limit)), CHAT_LIMITS.pageMax);
      return json(`/v1/chat/conversations/${enc(cid)}/messages${qs({ beforeSeq: q.beforeSeq, afterSeq: q.afterSeq, limit })}`, 'GET', MessagePageSchema, undefined, signal);
    },
    /** Idempotent theo `clientMsgId`: gửi lại cùng id => `duplicate: true`, không thêm tin */
    sendMessage(cid: string, req: SendMessageRequest, signal?: AbortSignal): Promise<SendMessageResponse> {
      const body = check(SendMessageRequestSchema, req, 'Tin nhắn');
      return json(`/v1/chat/conversations/${enc(cid)}/messages`, 'POST', SendMessageResponseSchema, body, signal);
    },
    markRead: (cid: string, seq: number, signal?: AbortSignal) => act(`/v1/chat/conversations/${enc(cid)}/read`, 'POST', check(ReadRequestSchema, { seq }, 'Số thứ tự'), signal),
    recallMessage: (id: string, signal?: AbortSignal) => act(`/v1/chat/messages/${enc(id)}/recall`, 'POST', undefined, signal),
    restoreMessage: (id: string, signal?: AbortSignal) => act(`/v1/chat/messages/${enc(id)}/restore`, 'POST', undefined, signal),
    hideConversation: (cid: string, signal?: AbortSignal) => act(`/v1/chat/conversations/${enc(cid)}/hide`, 'POST', undefined, signal),
    unhideConversation: (cid: string, signal?: AbortSignal) => act(`/v1/chat/conversations/${enc(cid)}/unhide`, 'POST', undefined, signal),
    muteConversation: (cid: string, mutedUntil: string | null, signal?: AbortSignal) => act(`/v1/chat/conversations/${enc(cid)}/mute`, 'PUT', check(MuteRequestSchema, { mutedUntil }, 'Giờ tắt tiếng'), signal),

    // ----- tệp đính kèm (Task 8) -----
    /** multipart: `conversationId` đi TRƯỚC `file` để Gateway đọc được ngay khi dòng chảy bắt đầu */
    uploadAttachment(cid: string, blob: Blob, media: 'image' | 'voice', signal?: AbortSignal) {
      const form = new FormData();
      form.append('conversationId', cid);
      form.append('media', media);
      form.append('file', blob, media === 'image' ? 'image' : 'voice');
      return json('/v1/chat/attachments', 'POST', AttachmentUploadResponseSchema, form, signal);
    },
    attachmentUrl: (id: string, signal?: AbortSignal) => json(`/v1/chat/attachments/${enc(id)}/url`, 'GET', AttachmentUrlResponseSchema, undefined, signal),

    // ----- nhóm (Task 12) -----
    addGroupMembers: (cid: string, memberIds: string[], signal?: AbortSignal) => act(`/v1/chat/groups/${enc(cid)}/members`, 'POST', check(GroupMemberChangeSchema, { memberIds }, 'Thành viên'), signal),
    removeGroupMember: (cid: string, userId: string, signal?: AbortSignal) => act(`/v1/chat/groups/${enc(cid)}/members/${enc(userId)}`, 'DELETE', undefined, signal),
    leaveGroup: (cid: string, successorId?: string, signal?: AbortSignal) => act(`/v1/chat/groups/${enc(cid)}/leave`, 'POST', check(GroupLeaveRequestSchema, successorId ? { successorId } : {}, 'Người kế nhiệm'), signal),
    setGroupTitle: (cid: string, title: string, signal?: AbortSignal) => act(`/v1/chat/groups/${enc(cid)}/title`, 'PUT', check(GroupTitleRequestSchema, { title }, 'Tên nhóm'), signal),
    setGroupRole: (cid: string, userId: string, role: 'admin' | 'member', signal?: AbortSignal) => act(`/v1/chat/groups/${enc(cid)}/members/${enc(userId)}/role`, 'PUT', check(GroupRoleRequestSchema, { role }, 'Vai trò'), signal),
    listGroupMembers: (cid: string, cursor?: string, signal?: AbortSignal) => json(`/v1/chat/groups/${enc(cid)}/members${qs({ cursor })}`, 'GET', GroupMembersResponseSchema, undefined, signal),

    // ----- báo cáo, thông báo đẩy -----
    report(input: ReportCreate, signal?: AbortSignal) {
      const body = check(ReportCreateSchema, input, 'Báo cáo');
      return json('/v1/chat/reports', 'POST', ReportCreateResponseSchema, body, signal);
    },
    registerPushToken: (input: PushToken, signal?: AbortSignal) => act('/v1/chat/push-tokens', 'POST', check(PushTokenSchema, input, 'Token'), signal),
    unregisterPushToken: (token: string, signal?: AbortSignal) => act(`/v1/chat/push-tokens/${enc(token)}`, 'DELETE', undefined, signal),

    // ----- cuộc gọi (Task 13): chỉ phần REST; báo hiệu WebRTC đi qua `realtime.send` -----
    startCall(input: CallStart, signal?: AbortSignal) {
      return json('/v1/calls', 'POST', CallStartResponseSchema, check(CallStartSchema, input, 'Cuộc gọi'), signal);
    },
    joinCall: (callId: string, signal?: AbortSignal) => json(`/v1/calls/${enc(callId)}/join`, 'POST', CallJoinResponseSchema, undefined, signal),
    getIceServers: (signal?: AbortSignal) => json('/v1/calls/ice', 'GET', IceServersResponseSchema, undefined, signal),
    reportCallStats: (callId: string, relaySeconds: number, signal?: AbortSignal) => act(`/v1/calls/${enc(callId)}/stats`, 'POST', check(CallStatsSchema, { relaySeconds }, 'Thống kê'), signal)
  };
}

/**
 * Mọi hàm luôn trả Promise (lỗi kiểm thân trước khi gửi cũng là Promise bị từ chối, không ném đồng bộ),
 * để nơi gọi chỉ cần một kiểu xử lý lỗi.
 */
export function createSocialRest() {
  const raw = createSocialRestRaw();
  const wrapped = Object.fromEntries(
    Object.entries(raw).map(([name, fn]) => [
      name,
      (...args: unknown[]) => {
        try {
          return Promise.resolve((fn as (...a: unknown[]) => unknown)(...args));
        } catch (e) {
          return Promise.reject(e);
        }
      }
    ])
  );
  return wrapped as unknown as { [K in keyof typeof raw]: (...a: Parameters<(typeof raw)[K]>) => Promise<Awaited<ReturnType<(typeof raw)[K]>>> };
}

export type SocialRest = ReturnType<typeof createSocialRest>;
