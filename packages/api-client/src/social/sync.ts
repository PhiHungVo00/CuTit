/**
 * Bù tin theo `seq` (dự án 4, spec 5.6 "Thứ tự và bù tin"). WebSocket chỉ là đường BÁO; nguồn sự thật là REST.
 *
 * Luật cho khung `msg` của một cuộc trò chuyện (giữ `lastSeq` từng cuộc):
 *   seq = lastSeq+1  → nhận ngay; seq ≤ lastSeq → bỏ (trùng);
 *   seq > lastSeq+1  → xếp vào bộ đệm và gọi `listMessages(afterSeq=lastSeq)` bù đúng đoạn thiếu, áp theo thứ tự.
 * Khung đến trong lúc đang bù chỉ vào bộ đệm (áp sau, theo thứ tự). Bù lỗi (mất mạng) => giữ bộ đệm, KHÔNG áp tin
 * lệch; `resync()` (sau nối lại) bù tiếp. Mỗi cuộc trò chuyện độc lập: lỗ ở cuộc này không chặn cuộc khác.
 */
import { CHAT_LIMITS, type Conversation, type Message, type MessagePage, type WsServerFrame } from '@vietlearning/contracts/api';

export interface SyncEvent {
  cid: string;
  message: Message;
}

export interface SyncOptions {
  listMessages(cid: string, q: { afterSeq: number; limit?: number }): Promise<MessagePage>;
  /** Danh sách cuộc trò chuyện (có `lastSeq` máy chủ) để `resync()` so sánh */
  listConversations?(): Promise<Conversation[]>;
}

export interface ConversationSync {
  /** Bắt đầu theo dõi / nâng `lastSeq` (không bao giờ lùi). Giao diện gọi sau khi tải trang tin đầu. */
  track(cid: string, lastSeq: number): void;
  lastSeq(cid: string): number | undefined;
  /** Áp khung từ WebSocket; khung không phải `msg` bị bỏ qua */
  handleFrame(frame: WsServerFrame): void;
  /** Sau nối lại: bù mọi cuộc có `lastSeq` máy chủ lớn hơn của mình */
  resync(): Promise<void>;
  /** Chờ mọi lần bù đang chạy xong (dùng trong test / trước khi hiển thị) */
  idle(): Promise<void>;
  onMessage(cb: (e: SyncEvent) => void): () => void;
  onConversations(cb: (list: Conversation[]) => void): () => void;
  onError(cb: (err: unknown) => void): () => void;
}

const BUFFER_MAX = 500;

interface ConvState {
  last: number;
  buffer: Map<number, Message>;
  filling: Promise<void> | null;
}

export function createConversationSync(opts: SyncOptions): ConversationSync {
  const convs = new Map<string, ConvState>();
  const msgCbs = new Set<(e: SyncEvent) => void>();
  const listCbs = new Set<(l: Conversation[]) => void>();
  const errCbs = new Set<(e: unknown) => void>();
  const emit = <T>(set: Set<(v: T) => void>, v: T): void => {
    for (const cb of [...set]) {
      try {
        cb(v);
      } catch {
        /* lỗi giao diện không làm hỏng luồng */
      }
    }
  };

  const get = (cid: string): ConvState | undefined => convs.get(cid);

  function apply(cid: string, st: ConvState, message: Message): void {
    st.last = message.seq;
    emit(msgCbs, { cid, message });
  }

  /** Áp mọi tin liên tiếp đang nằm trong bộ đệm bắt đầu từ lastSeq+1 */
  function drain(cid: string, st: ConvState): void {
    for (;;) {
      const next = st.buffer.get(st.last + 1);
      if (!next) break;
      st.buffer.delete(next.seq);
      apply(cid, st, next);
    }
    for (const seq of st.buffer.keys()) if (seq <= st.last) st.buffer.delete(seq);
  }

  /** Bù cho tới khi hết lỗ (tới `target` nếu biết, hoặc tới tin cao nhất trong bộ đệm) */
  function fill(cid: string, st: ConvState, target?: number): Promise<void> {
    if (st.filling) return st.filling;
    st.filling = (async () => {
      try {
        for (;;) {
          drain(cid, st);
          const highest = Math.max(target ?? 0, ...st.buffer.keys(), 0);
          if (st.last >= highest) return;
          const before = st.last;
          const page = await opts.listMessages(cid, { afterSeq: st.last, limit: CHAT_LIMITS.pageMax });
          const sorted = [...page.messages].filter((m) => m.seq > st.last).sort((a, b) => a.seq - b.seq);
          for (const m of sorted) {
            if (m.seq === st.last + 1) apply(cid, st, m);
            else if (m.seq > st.last + 1) st.buffer.set(m.seq, m); // lỗ giữa trang: để bộ đệm
          }
          drain(cid, st);
          if (st.last === before && !page.hasMore) return; // máy chủ không có thêm: dừng, tránh lặp vô hạn
          if (st.last === before && sorted.length === 0) return;
        }
      } catch (err) {
        emit(errCbs, err); // giữ bộ đệm; resync() bù tiếp
      } finally {
        st.filling = null;
      }
    })();
    return st.filling;
  }

  return {
    track(cid, lastSeq) {
      const st = get(cid);
      if (!st) convs.set(cid, { last: lastSeq, buffer: new Map(), filling: null });
      else if (lastSeq > st.last) {
        st.last = lastSeq;
        drain(cid, st);
      }
    },
    lastSeq: (cid) => get(cid)?.last,
    handleFrame(frame) {
      if (frame.t !== 'msg') return;
      const { message } = frame;
      const cid = message.cid;
      let st = get(cid);
      if (!st) {
        // Cuộc chưa theo dõi: giao diện chưa tải nó. Nhận tin và theo dõi từ đây; trang tin đầy đủ lấy bằng REST khi mở.
        st = { last: message.seq - 1, buffer: new Map(), filling: null };
        convs.set(cid, st);
      }
      if (message.seq <= st.last) return; // trùng
      if (st.filling || message.seq > st.last + 1) {
        if (st.buffer.size < BUFFER_MAX) st.buffer.set(message.seq, message);
        if (!st.filling) void fill(cid, st);
        return;
      }
      apply(cid, st, message);
      drain(cid, st);
    },
    async resync() {
      if (!opts.listConversations) {
        await Promise.all([...convs].map(([cid, st]) => fill(cid, st)));
        return;
      }
      let list: Conversation[];
      try {
        list = await opts.listConversations();
      } catch (err) {
        emit(errCbs, err);
        return;
      }
      const jobs: Promise<void>[] = [];
      for (const c of list) {
        const st = get(c.id);
        if (st && (c.lastSeq > st.last || st.buffer.size > 0)) jobs.push(fill(c.id, st, c.lastSeq));
      }
      emit(listCbs, list);
      await Promise.all(jobs);
    },
    async idle() {
      for (;;) {
        const pending = [...convs.values()].map((s) => s.filling).filter((p): p is Promise<void> => !!p);
        if (!pending.length) return;
        await Promise.all(pending);
      }
    },
    onMessage(cb) {
      msgCbs.add(cb);
      return () => msgCbs.delete(cb);
    },
    onConversations(cb) {
      listCbs.add(cb);
      return () => listCbs.delete(cb);
    },
    onError(cb) {
      errCbs.add(cb);
      return () => errCbs.delete(cb);
    }
  };
}
