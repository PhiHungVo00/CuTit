import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Message } from '@vietlearning/contracts/api';
import { schema, type DbProvider } from '../../db/client.js';
import type { ChatEligibilityFn } from '../chat/eligibility.js';
import type { RealtimeBus } from '../realtime/RealtimeBus.js';
import { buildPayload, type PushLocale } from './payload.js';
import type { PushLog, PushProvider } from './PushProvider.js';
import { activeTokensOf, disableTokens, purgeStalePushTokens } from './tokens.js';

const { conversationMembers, conversations, socialProfiles, userBlocks } = schema;

/** Hằng số quy tắc gửi (spec 5.6/8.3). */
export const PUSH_RULES = {
  /** trì hoãn rồi kiểm "đã đọc / đã vào nền trước" */
  delayMs: 3000,
  /** nhóm từ chừng này thành viên: tắt thông báo mặc định */
  largeGroupMembers: 200,
  /** token/lần gọi nhà cung cấp */
  batchSize: 500,
  /** các lần chờ trước mỗi lần thử lại (tổng 1 + 3 lần thử) */
  retryDelaysMs: [1_000, 5_000, 20_000] as readonly number[],
  /** trần số thông báo đang chờ (chặn phình bộ nhớ khi có bão tin) */
  maxPending: 20_000,
  purgeEveryMs: 6 * 3600_000
} as const;

export interface PushNotifierDeps {
  db: DbProvider;
  bus: RealtimeBus;
  provider: PushProvider | null;
  eligibility: ChatEligibilityFn;
  log: PushLog;
  now?: () => Date;
  delayMs?: number;
  retryDelaysMs?: readonly number[];
  /** chỉ test: ngưỡng "nhóm lớn" */
  largeGroupMembers?: number;
}

export interface PushNotifier {
  /** Chạy NGAY mọi thông báo đang chờ trì hoãn và đợi xong (dùng cho test/tắt máy êm) */
  flush(): Promise<void>;
  /** Hủy việc chờ, chờ việc đang chạy xong, bỏ đăng ký bus */
  stop(): Promise<void>;
}

type Pending = { timer: NodeJS.Timeout; userId: string; msg: Message };
const sanitize = (err: unknown): string => (err instanceof Error && err.name === 'PushError' ? err.message : err instanceof Error ? err.name : 'error');

/**
 * Nối thông báo đẩy vào lõi chat QUA BUS (`bus.subscribe`): chat không biết push tồn tại, và push chỉ chạy SAU commit
 * (khung `msg` chỉ phát sau commit), nên lỗi push không thể làm hỏng việc gửi tin.
 *
 * Quy tắc (mỗi người nhận): khung `msg` mới của người khác → chờ 3 giây (nhiều tin cùng cuộc trong lúc chờ GỘP thành một,
 * lấy tin mới nhất) → bỏ qua nếu: đang có WS ở nền trước; đã đọc tới tin này; đã tắt tiếng cuộc trò chuyện; nhóm ≥ 200 người;
 * không còn là thành viên; không còn đủ điều kiện chat; đã chặn người gửi; không có token. Nội dung theo `show_push_preview`.
 */
export function startPushNotifier(deps: PushNotifierDeps): PushNotifier {
  const { bus, provider, db, eligibility, log } = deps;
  const now = deps.now ?? (() => new Date());
  const delayMs = deps.delayMs ?? PUSH_RULES.delayMs;
  const retryDelays = deps.retryDelaysMs ?? PUSH_RULES.retryDelaysMs;
  const largeGroup = deps.largeGroupMembers ?? PUSH_RULES.largeGroupMembers;
  const pending = new Map<string, Pending>();
  const inflight = new Set<Promise<void>>();
  const sleepers = new Set<{ timer: NodeJS.Timeout; resolve: (ok: boolean) => void }>();
  let stopped = false;

  const sleep = (ms: number): Promise<boolean> =>
    new Promise((resolve) => {
      if (stopped) return resolve(false);
      const s = { timer: setTimeout(() => (sleepers.delete(s), resolve(true)), ms).unref(), resolve };
      sleepers.add(s);
    });

  const track = (p: Promise<void>): void => {
    inflight.add(p);
    void p.finally(() => inflight.delete(p));
  };

  /** gửi một mẻ ≤ 500 token, thử lại có giới hạn token gặp lỗi tạm; lỗi nhà cung cấp chỉ ghi log gọn */
  async function sendBatch(tokens: string[], msg: ReturnType<typeof buildPayload>): Promise<void> {
    if (!provider) return;
    let todo = tokens;
    for (let attempt = 0; ; attempt++) {
      let retry: string[] = [];
      try {
        const r = await provider.send(todo, msg);
        if (r.invalid.length) await disableTokens(await db.get(), r.invalid, now());
        retry = r.retry ?? [];
      } catch (err) {
        log.warn({ reason: sanitize(err), attempt }, 'push send failed');
        retry = todo;
      }
      if (!retry.length) return;
      if (attempt >= retryDelays.length) {
        log.warn({ dropped: retry.length }, 'push dropped after retries');
        return;
      }
      if (!(await sleep(retryDelays[attempt]))) return;
      todo = retry;
    }
  }

  async function deliver(userId: string, m: Message): Promise<void> {
    if (!provider || stopped) return;
    if (bus.isForeground(userId)) return; // đang nhìn app: WS đã đưa tin
    const d = await db.get();
    const [mem] = await d
      .select({
        lastRead: conversationMembers.lastReadSeq,
        mutedUntil: conversationMembers.mutedUntil,
        kind: conversations.kind,
        members: sql<number>`(select count(*)::int from conversation_members x where x.conversation_id = ${conversations.id} and x.left_at is null)`,
        preview: sql<boolean>`coalesce(${socialProfiles.showPushPreview}, false)`
      })
      .from(conversationMembers)
      .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
      .leftJoin(socialProfiles, eq(socialProfiles.userId, conversationMembers.userId))
      .where(and(eq(conversationMembers.conversationId, m.cid), eq(conversationMembers.userId, userId), isNull(conversationMembers.leftAt)));
    if (!mem) return;
    if (mem.lastRead >= m.seq) return; // đã đọc trong lúc chờ
    if (mem.mutedUntil && mem.mutedUntil > now()) return;
    if (mem.kind === 'group' && mem.members >= largeGroup) return;
    if (m.sender) {
      const [blocked] = await d
        .select({ b: userBlocks.blockerId })
        .from(userBlocks)
        .where(and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, m.sender.id)))
        .limit(1);
      if (blocked) return;
    }
    if (!(await eligibility(d, userId)).ok) return;
    const tokens = await activeTokensOf(d, userId);
    if (!tokens.length || m.kind === 'system') return;
    const kind = m.kind;
    for (const locale of ['vi', 'en'] as PushLocale[]) {
      const list = tokens.filter((t) => t.locale === locale).map((t) => t.token);
      if (!list.length) continue;
      const payload = buildPayload({ cid: m.cid, kind, body: m.body, fromName: m.sender?.displayName ?? '' }, { showPreview: mem.preview, locale });
      for (let i = 0; i < list.length; i += PUSH_RULES.batchSize) await sendBatch(list.slice(i, i + PUSH_RULES.batchSize), payload);
    }
  }

  const fire = (key: string): void => {
    const p = pending.get(key);
    if (!p) return;
    pending.delete(key);
    clearTimeout(p.timer);
    track(
      deliver(p.userId, p.msg).catch((err: unknown) => {
        log.warn({ reason: sanitize(err) }, 'push deliver failed');
      })
    );
  };

  const unsubscribe = provider
    ? bus.subscribe((userIds, frame) => {
        if (stopped || frame.t !== 'msg') return;
        const m = frame.message;
        if (m.mine || m.deleted || m.blocked || m.kind === 'system' || !m.sender) return;
        for (const userId of userIds) {
          if (userId === m.sender.id || bus.isForeground(userId)) continue;
          const key = `${userId}:${m.cid}`;
          const cur = pending.get(key);
          if (cur) {
            if (m.seq > cur.msg.seq) cur.msg = m; // gộp: giữ tin mới nhất, KHÔNG kéo dài thời gian chờ
            continue;
          }
          if (pending.size >= PUSH_RULES.maxPending) continue;
          pending.set(key, { userId, msg: m, timer: setTimeout(() => fire(key), delayMs).unref() });
        }
      })
    : () => undefined;

  // dọn token mồ côi định kỳ (không phụ thuộc có tin hay không)
  const purge = (): void => {
    if (stopped) return;
    track(
      db
        .get()
        .then((d) => purgeStalePushTokens(d, now()))
        .then(() => undefined)
        .catch((err: unknown) => log.warn({ reason: sanitize(err) }, 'push token purge failed'))
    );
  };
  const purgeTimer = provider ? setInterval(purge, PUSH_RULES.purgeEveryMs).unref() : undefined;

  const settle = async (): Promise<void> => {
    while (inflight.size) await Promise.allSettled([...inflight]);
  };

  return {
    async flush() {
      for (const key of [...pending.keys()]) fire(key);
      await settle();
    },
    async stop() {
      stopped = true;
      unsubscribe();
      clearInterval(purgeTimer);
      for (const p of pending.values()) clearTimeout(p.timer);
      pending.clear();
      for (const s of sleepers) {
        clearTimeout(s.timer);
        s.resolve(false);
      }
      sleepers.clear();
      await settle();
    }
  };
}
