import { and, eq, isNull } from 'drizzle-orm';
import { ChatErrorCode } from '@vietlearning/contracts/api';
import { schema, type Db } from '../../db/client.js';
import { GatewayError } from '../../pipeline/RequestPipeline.js';
import type { RealtimeBus } from '../realtime/RealtimeBus.js';
import { activeMembers } from './conversations.js';
import { loadMessageRow, publishMessageFrame, safePublish } from './messages.js';

const { chatMessages, conversationMembers } = schema;

/**
 * Tìm tin để thu hồi/hoàn tác. Người KHÔNG ở trong cuộc trò chuyện chứa tin → 404 `message_not_found` (không cho biết tin có tồn tại);
 * thành viên nhưng không phải người gửi → 403. Trong 1-1 chỉ người gửi được thu hồi (quản trị nhóm thu hồi tin người khác: Task 12).
 * Tin hệ thống / tin của người đã xóa tài khoản không thu hồi được.
 */
async function loadOwnMessage(db: Db, userId: string, messageId: string) {
  const row = await loadMessageRow(db, messageId);
  if (!row) throw new GatewayError(404, ChatErrorCode.messageNotFound, 'Không tìm thấy tin nhắn');
  const [member] = await db
    .select({ u: conversationMembers.userId })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, row.m.conversationId), eq(conversationMembers.userId, userId), isNull(conversationMembers.leftAt)));
  if (!member) throw new GatewayError(404, ChatErrorCode.messageNotFound, 'Không tìm thấy tin nhắn');
  if (row.m.kind === 'system' || row.m.deletedKind === 'account_deleted' || row.m.senderId !== userId) {
    throw new GatewayError(403, ChatErrorCode.forbidden, 'Bạn chỉ thu hồi được tin của chính mình');
  }
  return row;
}

/**
 * Thu hồi (xóa mềm): đặt `deleted_at` + `deleted_kind='recalled'`; server GIỮ nội dung để hoàn tác. Làm lại lần nữa thì không đổi gì
 * và không phát lại khung (idempotent).
 */
export async function recallMessage(db: Db, bus: RealtimeBus, userId: string, messageId: string, now = new Date()): Promise<void> {
  const row = await loadOwnMessage(db, userId, messageId);
  if (row.m.deletedAt) return;
  const changed = await db
    .update(chatMessages)
    .set({ deletedAt: now, deletedKind: 'recalled' })
    .where(and(eq(chatMessages.id, messageId), isNull(chatMessages.deletedAt)))
    .returning({ id: chatMessages.id });
  if (!changed.length) return;
  const members = (await activeMembers(db, row.m.conversationId)).map((m) => m.userId);
  safePublish(bus, members, { t: 'recall', cid: row.m.conversationId, messageId, seq: row.m.seq });
}

/** Hoàn tác thu hồi (chỉ người gửi, chỉ tin do CHÍNH họ thu hồi). Tin chưa thu hồi → không đổi gì. */
export async function restoreMessage(db: Db, bus: RealtimeBus, userId: string, messageId: string): Promise<void> {
  const row = await loadOwnMessage(db, userId, messageId);
  if (!row.m.deletedAt) return;
  const changed = await db
    .update(chatMessages)
    .set({ deletedAt: null, deletedKind: null })
    .where(and(eq(chatMessages.id, messageId), eq(chatMessages.deletedKind, 'recalled')))
    .returning({ id: chatMessages.id });
  if (!changed.length) return;
  const fresh = await loadMessageRow(db, messageId);
  if (fresh) await publishMessageFrame(db, bus, fresh, 'restore');
}
