import type {
  AgeDeclareResponse,
  Conversation,
  FriendRequest,
  Message,
  MessagePage,
  ReportCreate,
  SendMessageRequest,
  SocialSettings,
  WsServerFrame
} from '@vietlearning/contracts/api';

/**
 * Giao diện client mà mfe-social dùng (Dự án 4, Task 7). Chỉ `import type` từ contracts => không kéo zod vào chunk chat.
 *
 * ĐÂY LÀ BẢN GIẢ ĐỊNH theo mô tả "Interfaces" của Task 6 (packages/api-client/src/social): khi Task 6 vào main, host thay
 * `host-shell/src/social/client.ts` bằng `createSocialClient(...)` thật; nếu tên hàm của client thật khác thì chỉ sửa MỘT
 * chỗ (bộ chuyển tiếp ở host), mfe-social không đổi. Xem docs/superpowers/plans/2026-11-25-ban-be.md, Task 6.
 *
 * Lỗi: mọi hàm reject bằng đối tượng có `status?` (HTTP) và `code?` (mã lỗi Gateway, vd. 'handle_not_found');
 * lỗi mạng có `kind: 'offline'` (khớp GatewayRequestError của api-client).
 */
/** Khớp SocialMeSchema (contracts/api/chat-social.ts; contracts chưa export kiểu này) */
export interface SocialMe {
  handle: string | null;
  suggestedHandle: string | null;
  ineligible: 'guest' | 'pending_deletion' | 'minor' | 'age_unknown' | 'no_handle' | 'restricted' | null;
  settings: SocialSettings;
}

export interface SocialRest {
  me(): Promise<SocialMe>;
  setHandle(handle: string): Promise<{ handle: string }>;
  /** Gửi năm sinh MỘT lần; Gateway chỉ giữ cờ đủ/chưa đủ, không giữ năm sinh. */
  declareAge(birthYear: number): Promise<AgeDeclareResponse>;
  listConversations(): Promise<{ conversations: Conversation[]; nextCursor: string | null }>;
  listMessages(cid: string, q?: { beforeSeq?: number; afterSeq?: number; limit?: number }): Promise<MessagePage>;
  sendMessage(cid: string, req: SendMessageRequest): Promise<{ id: string; seq: number; createdAt: string; duplicate?: boolean }>;
  markRead(cid: string, seq: number): Promise<void>;
  recall(messageId: string): Promise<void>;
  restore(messageId: string): Promise<void>;
  listFriendRequests(): Promise<{ requests: FriendRequest[] }>;
  createFriendRequest(handle: string): Promise<void>;
  respondFriendRequest(id: string, accept: boolean): Promise<void>;
  /** Mã mời (luồng hiện có): kết bạn ngay. Dùng được cả với khách. */
  acceptInvite(code: string): Promise<{ friend: { displayName: string } }>;
  blockUser(userId: string): Promise<void>;
  report(req: ReportCreate): Promise<{ id: string }>;
}

export type ConnState = 'idle' | 'connecting' | 'online' | 'reconnecting';

export interface SocialRealtime {
  readonly state: ConnState;
  connect(): void;
  close(): void;
  on(fn: (f: WsServerFrame) => void): () => void;
  onState(fn: (s: ConnState) => void): () => void;
}

export interface SocialClient {
  rest: SocialRest;
  realtime: SocialRealtime;
}

export type { Conversation, Message };
