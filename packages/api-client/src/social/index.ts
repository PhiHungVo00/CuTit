/**
 * Client Bạn bè (dự án 4) — subpath `@vietlearning/api-client/social`. Nạp LƯỜI (chỉ khi mở tab Tin nhắn / gọi);
 * KHÔNG re-export từ `index.ts` để không vào gói đầu.
 *
 *   const client = createSocialClient();
 *   client.rest.listConversations();          // REST có kiểu (Bearer, gửi lại một lần khi 401)
 *   client.realtime.connect();                 // WebSocket: hello, nối lại có lùi, dừng khi ra nền
 *   client.sync.track(cid, lastSeq);           // bù tin theo seq
 *   client.send({ cid, text });                // vào Outbox rồi gửi; offline => chờ, gửi lại ĐÚNG clientMsgId
 *   client.subscribe(cid, (e) => …);           // sự kiện cho giao diện
 *
 * Không giữ token hay khóa nào: token luôn lấy từ phiên hiện có (cấu hình Gateway) ở mỗi lần cần.
 */
import type { Message, WsServerFrame } from '@vietlearning/contracts/api';
import { createOutbox, type Outbox, type OutboxInput, type OutboxItem, type OutboxOptions, type SentEvent } from './outbox.js';
import { createRealtime, type Realtime, type RealtimeOptions, type RealtimeState } from './ws.js';
import { createSocialRest, type SocialRest } from './rest.js';
import { createConversationSync, type ConversationSync } from './sync.js';

export * from './rest.js';
export * from './ws.js';
export * from './sync.js';
export * from './outbox.js';

export interface SocialClientOptions {
  rest?: SocialRest;
  realtime?: RealtimeOptions;
  outbox?: Pick<OutboxOptions, 'store' | 'scheduler' | 'random'>;
}

/** Sự kiện giao diện của MỘT cuộc trò chuyện (đã sắp thứ tự, đã khử trùng) */
export type ConversationEvent =
  | { type: 'message'; message: Message }
  | { type: 'sent'; clientMsgId: string; id: string; seq: number; createdAt: string }
  | { type: 'frame'; frame: WsServerFrame }
  | { type: 'outbox' };

export interface SocialClient {
  rest: SocialRest;
  realtime: Realtime;
  sync: ConversationSync;
  outbox: Outbox;
  /** Kết nối (nếu đủ điều kiện) — gọi lười lúc rảnh */
  start(): void;
  stop(): void;
  /** Soạn tin chữ: vào hàng đợi rồi gửi ngay; trả mục hàng đợi (giao diện hiện "đang gửi") */
  send(input: OutboxInput): Promise<OutboxItem>;
  /** Nghe một cuộc trò chuyện; trả hàm hủy */
  subscribe(cid: string, cb: (e: ConversationEvent) => void): () => void;
  /** Nghe mọi khung (friend, presence, call.*, …) */
  onFrame(cb: (f: WsServerFrame) => void): () => void;
  onState(cb: (s: RealtimeState) => void): () => void;
}

function frameCid(f: WsServerFrame): string | undefined {
  if ('cid' in f && typeof f.cid === 'string') return f.cid;
  if (f.t === 'restore') return f.message.cid;
  return undefined;
}

export function createSocialClient(opts: SocialClientOptions = {}): SocialClient {
  const rest = opts.rest ?? createSocialRest();
  const realtime = createRealtime(opts.realtime);
  const outbox = createOutbox({ rest, ...opts.outbox });
  const sync = createConversationSync({
    listMessages: (cid, q) => rest.listMessages(cid, q),
    listConversations: async () => {
      const all = [];
      let cursor: string | undefined;
      for (let i = 0; i < 5; i++) {
        const page = await rest.listConversations({ cursor });
        all.push(...page.conversations);
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }
      return all;
    }
  });

  const listeners = new Map<string, Set<(e: ConversationEvent) => void>>();
  const dispatch = (cid: string, e: ConversationEvent): void => {
    for (const cb of [...(listeners.get(cid) ?? [])]) {
      try {
        cb(e);
      } catch {
        /* giao diện lỗi không lan ra */
      }
    }
  };

  // WebSocket => bù tin => giao diện. Mọi khung `msg` đi qua `sync` (thứ tự, khử trùng, bù lỗ).
  realtime.on((frame) => {
    sync.handleFrame(frame);
    if (frame.t === 'msg') return; // `sync` sẽ phát ra theo thứ tự
    const cid = frameCid(frame);
    if (cid) dispatch(cid, { type: 'frame', frame });
  });
  sync.onMessage(({ cid, message }) => dispatch(cid, { type: 'message', message }));
  outbox.onSent((e: SentEvent) => dispatch(e.cid, { type: 'sent', clientMsgId: e.clientMsgId, id: e.id, seq: e.seq, createdAt: e.createdAt }));
  outbox.onChange(() => {
    for (const cid of listeners.keys()) dispatch(cid, { type: 'outbox' });
  });
  outbox.attach(realtime);

  // Sau nối lại: bù từ REST (WebSocket không phải nguồn sự thật). Lần `online` đầu cũng chạy: rẻ và đúng.
  realtime.onState((s) => {
    if (s === 'online') void sync.resync();
  });

  return {
    rest,
    realtime,
    sync,
    outbox,
    start: () => realtime.connect(),
    stop: () => realtime.close(),
    async send(input) {
      const item = await outbox.enqueue(input);
      void outbox.flush();
      return item;
    },
    subscribe(cid, cb) {
      let set = listeners.get(cid);
      if (!set) listeners.set(cid, (set = new Set()));
      set.add(cb);
      return () => {
        set!.delete(cb);
        if (!set!.size) listeners.delete(cid);
      };
    },
    onFrame: (cb) => realtime.on(cb),
    onState: (cb) => realtime.onState(cb)
  };
}

/**
 * Dòng thời gian của một cuộc: tin đã có `seq` theo `seq` (khử trùng theo `id`), tin chờ/lỗi của Outbox nằm CUỐI
 * theo thứ tự soạn. Mục Outbox nào đã xuất hiện trong `confirmed` (trùng `id` qua sự kiện `sent`) không hiện hai lần.
 */
export function buildTimeline(confirmed: readonly Message[], pending: readonly OutboxItem[], sentIds: ReadonlySet<string> = new Set()): Array<{ kind: 'message'; message: Message } | { kind: 'pending'; item: OutboxItem }> {
  const byId = new Map<string, Message>();
  for (const m of confirmed) byId.set(m.id, m);
  const ordered = [...byId.values()].sort((a, b) => a.seq - b.seq);
  const out: Array<{ kind: 'message'; message: Message } | { kind: 'pending'; item: OutboxItem }> = ordered.map((message) => ({ kind: 'message', message }));
  for (const item of [...pending].sort((a, b) => a.createdAt - b.createdAt)) {
    if (sentIds.has(item.clientMsgId)) continue;
    out.push({ kind: 'pending', item });
  }
  return out;
}
