import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { schema, type Db } from '../../db/client.js';
import type { RealtimeBus } from '../realtime/RealtimeBus.js';
import { activeMembers, getMembership } from './conversations.js';
import { GROUP_LARGE_THRESHOLD } from './groupRules.js';
import { bestEffort, safePublish } from './messages.js';

const { conversationMembers } = schema;

/**
 * Đánh dấu đã đọc tới `seq`. KHÔNG lùi (đọc tới 10 rồi báo 5 thì vẫn 10), KHÔNG vượt `last_seq` (không "đọc trước" tin chưa có).
 * Khung `read` chỉ phát khi thật sự tiến lên, tới các thành viên khác bật "đã xem" — và chỉ khi người đọc cũng bật (đối xứng, spec 5.7).
 */
export async function markRead(db: Db, bus: RealtimeBus, userId: string, cid: string, seq: number): Promise<{ lastReadSeq: number }> {
  const { conv, m } = await getMembership(db, userId, cid);
  const target = Math.min(Math.floor(seq), conv.lastSeq);
  if (target < 1 || target <= m.lastReadSeq) return { lastReadSeq: m.lastReadSeq };
  const [updated] = await db
    .update(conversationMembers)
    .set({ lastReadSeq: sql`greatest(${conversationMembers.lastReadSeq}, ${target})` })
    .where(and(eq(conversationMembers.conversationId, cid), eq(conversationMembers.userId, userId), isNull(conversationMembers.leftAt), lt(conversationMembers.lastReadSeq, target)))
    .returning({ v: conversationMembers.lastReadSeq });
  if (!updated) return { lastReadSeq: Math.max(m.lastReadSeq, target) };
  await bestEffort(async () => {
    // nhóm lớn: không phát `read` từng người (client hỏi "đã xem bởi N" lười qua GET …/readers). Đếm TRƯỚC khi tải danh sách (nhóm 1.000 người).
    if (conv.kind === 'group') {
      const [c] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(conversationMembers)
        .where(and(eq(conversationMembers.conversationId, cid), isNull(conversationMembers.leftAt)));
      if ((c?.n ?? 0) > GROUP_LARGE_THRESHOLD) return;
    }
    const members = await activeMembers(db, cid);
    const me = members.find((x) => x.userId === userId);
    if (me?.showReadReceipts) {
      safePublish(
        bus,
        members.filter((x) => x.userId !== userId && x.showReadReceipts).map((x) => x.userId),
        { t: 'read', cid, userId, seq: target }
      );
    }
  });
  return { lastReadSeq: updated.v };
}
