import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { schema, type DbProvider } from '../../db/client.js';

/**
 * "Ai được biết gì về ai" cho khung typing/presence (spec 5.6, 5.7). Hub chỉ biết interface này (dễ giả khi test).
 * Mọi hàm trả danh sách người NHẬN; lỗi → ném (hub bắt và bỏ khung, không ảnh hưởng kết nối).
 */
export interface RealtimeDirectory {
  /** thành viên còn trong cuộc `cid` mà `userId` được "gõ" tới; [] nếu `userId` không phải thành viên đang hoạt động, nhóm quá lớn, hoặc không có ai */
  typingAudience(userId: string, cid: string): Promise<string[]>;
  /** bạn bè của `userId` sẽ thấy trạng thái trực tuyến (hai bên cùng bật show_online, không chặn nhau) */
  presenceAudience(userId: string): Promise<string[]>;
}

/** Nhóm lớn hơn mức này: tắt "đang gõ" (spec 5.6 — nhóm > 50 người) */
export const TYPING_GROUP_MAX = 50;

export function createDbDirectory(db: DbProvider): RealtimeDirectory {
  /** Người trong `ids` có chặn `userId` hoặc bị `userId` chặn */
  async function blockedWith(userId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const d = await db.get();
    const rows = await d
      .select({ blocker: schema.userBlocks.blockerId, blocked: schema.userBlocks.blockedId })
      .from(schema.userBlocks)
      .where(
        or(
          and(eq(schema.userBlocks.blockerId, userId), inArray(schema.userBlocks.blockedId, ids)),
          and(eq(schema.userBlocks.blockedId, userId), inArray(schema.userBlocks.blockerId, ids))
        )
      );
    return new Set(rows.map((r) => (r.blocker === userId ? r.blocked : r.blocker)));
  }

  return {
    async typingAudience(userId, cid) {
      const d = await db.get();
      const members = await d
        .select({ userId: schema.conversationMembers.userId })
        .from(schema.conversationMembers)
        .where(and(eq(schema.conversationMembers.conversationId, cid), isNull(schema.conversationMembers.leftAt)));
      const ids = members.map((m) => m.userId);
      if (!ids.includes(userId) || ids.length > TYPING_GROUP_MAX) return [];
      const others = ids.filter((id) => id !== userId);
      const blocked = await blockedWith(userId, others);
      return others.filter((id) => !blocked.has(id));
    },

    async presenceAudience(userId) {
      const d = await db.get();
      const [me] = await d
        .select({ showOnline: schema.socialProfiles.showOnline })
        .from(schema.socialProfiles)
        .where(eq(schema.socialProfiles.userId, userId));
      if (!me?.showOnline) return [];
      const pairs = await d
        .select({ a: schema.friendships.userA, b: schema.friendships.userB })
        .from(schema.friendships)
        .where(or(eq(schema.friendships.userA, userId), eq(schema.friendships.userB, userId)));
      const friends = pairs.map((p) => (p.a === userId ? p.b : p.a));
      if (friends.length === 0) return [];
      const visible = await d
        .select({ userId: schema.socialProfiles.userId })
        .from(schema.socialProfiles)
        .where(and(inArray(schema.socialProfiles.userId, friends), eq(schema.socialProfiles.showOnline, true)));
      const ids = visible.map((v) => v.userId);
      const blocked = await blockedWith(userId, ids);
      return ids.filter((id) => !blocked.has(id));
    }
  };
}
