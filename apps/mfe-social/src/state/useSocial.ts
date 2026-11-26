import { useCallback, useEffect, useRef, useState } from 'react';
import type { Conversation, ConnState, Message, SocialClient } from '../client/types';
import { errCode, isOffline, isUnavailable } from '../client/errors';

/**
 * Sự kiện (cửa sổ) báo tổng số tin chưa đọc, `detail` = số. MFE không import chéo nên Host và mfe-learner chỉ thống nhất
 * tên sự kiện (host-shell/src/shell/ChatDot.tsx, mfe-learner/src/profile/useChatUnread.ts): GIỮ BA CHUỖI TRÙNG NHAU.
 */
export const CHAT_UNREAD_EVENT = 'becutit:chat-unread';
export const emitUnread = (n: number) => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CHAT_UNREAD_EVENT, { detail: n }));
};

export type Load<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; offline: boolean; unavailable: boolean };

function useLoad<T>(fetcher: () => Promise<T>, deps: unknown[]): { state: Load<T>; reload: () => void; set: (d: T) => void } {
  const [state, setState] = useState<Load<T>>({ status: 'loading' });
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    fetcher().then(
      (data) => alive && setState({ status: 'ready', data }),
      (e) => alive && setState({ status: 'error', offline: isOffline(e), unavailable: isUnavailable(e) })
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { state, reload: useCallback(() => setN((x) => x + 1), []), set: (d) => setState({ status: 'ready', data: d }) };
}

export const useMe = (client: SocialClient) => useLoad(() => client.rest.me(), [client]);

export function useConnState(client: SocialClient): ConnState {
  const [s, setS] = useState<ConnState>(client.realtime.state);
  useEffect(() => {
    setS(client.realtime.state);
    return client.realtime.onState(setS);
  }, [client]);
  return s;
}

const byRecent = (a: Conversation, b: Conversation) => (b.lastMessage?.createdAt ?? '').localeCompare(a.lastMessage?.createdAt ?? '') || b.lastSeq - a.lastSeq;

/** Danh sách cuộc trò chuyện: sắp theo tin mới nhất, cập nhật theo khung WebSocket. */
export function useConversationList(client: SocialClient) {
  const load = useLoad(() => client.rest.listConversations().then((r) => [...r.conversations].sort(byRecent)), [client]);
  const { reload } = load;
  const data = load.state.status === 'ready' ? load.state.data : null;
  const list = useRef<Conversation[] | null>(null);
  list.current = data;
  const { set } = load;
  useEffect(() => {
    client.realtime.connect();
    return client.realtime.on((f) => {
      if (f.t === 'msg') {
        const cur = list.current;
        const m = f.message;
        if (!cur || !cur.some((c) => c.id === m.cid)) return reload();
        set(
          cur
            .map((c) =>
              c.id === m.cid
                ? { ...c, lastSeq: Math.max(c.lastSeq, m.seq), unread: m.mine ? c.unread : c.unread + 1, lastMessage: { seq: m.seq, kind: m.kind, createdAt: m.createdAt, preview: m.body?.slice(0, 120) } }
                : c
            )
            .sort(byRecent)
        );
      } else if (f.t === 'conv' || (f.t === 'friend' && f.change === 'accepted')) reload();
    });
  }, [client, reload, set]);
  useEffect(() => {
    if (data) emitUnread(data.reduce((a, c) => a + c.unread, 0));
  }, [data]);
  return load;
}

export type Pending = { localId: string; clientMsgId: string; body: string; status: 'sending' | 'failed'; error?: string };

const uuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/[x]/g, () => ((Math.random() * 16) | 0).toString(16));

const sortSeq = (l: Message[]) => [...l].sort((a, b) => a.seq - b.seq);
/** Gộp theo `id`; bản mới thay bản cũ (thu hồi/hoàn tác/đã chặn đổi nội dung cùng id). */
const merge = (cur: Message[], incoming: Message[]): Message[] => {
  const map = new Map(cur.map((m) => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  return sortSeq([...map.values()]);
};

export type SendError = 'rate' | 'notMember' | 'blocked' | 'other';
const sendErrKey = (e: unknown): SendError => {
  const c = errCode(e);
  return c === 'chat_rate' ? 'rate' : c === 'not_a_member' ? 'notMember' : c === 'blocked' || c === 'peer_unavailable' ? 'blocked' : 'other';
};

/**
 * Một cuộc trò chuyện: tin sắp theo `seq`; tin chờ gửi nằm cuối; khung `msg` đúng `lastSeq+1` thì nhận, trùng bỏ,
 * nhảy cách thì bù bằng `afterSeq`; nối lại thì bù lần nữa. Gửi lại luôn giữ NGUYÊN `clientMsgId` (server chống trùng).
 */
export function useConversation(client: SocialClient, cid: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errState, setErrState] = useState({ offline: false, unavailable: false });
  const [hasMore, setHasMore] = useState(false);
  const [reload, setReload] = useState(0);
  const msgs = useRef<Message[]>([]);
  msgs.current = messages;
  const gap = useRef<Promise<void> | null>(null);

  const lastSeq = () => msgs.current.reduce((a, m) => Math.max(a, m.seq), 0);

  const fill = useCallback(async () => {
    // bù tới khi hết (mỗi trang tối đa pageMax)
    for (let i = 0; i < 20; i++) {
      const after = lastSeq();
      const page = await client.rest.listMessages(cid, { afterSeq: after });
      if (page.messages.length) {
        msgs.current = merge(msgs.current, page.messages);
        setMessages(msgs.current);
      }
      if (!page.hasMore) break;
    }
  }, [client, cid]);

  const resync = useCallback(() => {
    if (!gap.current) gap.current = fill().catch(() => undefined).finally(() => void (gap.current = null));
    return gap.current;
  }, [fill]);

  useEffect(() => {
    let alive = true;
    msgs.current = [];
    setMessages([]);
    setPending([]);
    setStatus('loading');
    client.rest.listMessages(cid, {}).then(
      (page) => {
        if (!alive) return;
        msgs.current = sortSeq(page.messages);
        setMessages(msgs.current);
        setHasMore(page.hasMore);
        setStatus('ready');
      },
      (e) => {
        if (!alive) return;
        setErrState({ offline: isOffline(e), unavailable: isUnavailable(e) });
        setStatus('error');
      }
    );
    client.realtime.connect();
    const off = client.realtime.on((f) => {
      if (f.t === 'msg' && f.message.cid === cid) {
        const m = f.message;
        const last = lastSeq();
        if (msgs.current.some((x) => x.id === m.id)) return; // trùng
        if (m.seq > last + 1 && last > 0) void resync(); // nhảy cách: bù đủ rồi mới áp theo thứ tự
        else {
          msgs.current = merge(msgs.current, [m]);
          setMessages(msgs.current);
        }
      } else if (f.t === 'recall' && f.cid === cid) {
        msgs.current = msgs.current.map((m) => (m.id === f.messageId ? { ...m, deleted: true, body: undefined, attachment: undefined } : m));
        setMessages(msgs.current);
      } else if (f.t === 'restore' && f.message.cid === cid) {
        msgs.current = merge(msgs.current, [f.message]);
        setMessages(msgs.current);
      }
    });
    let prev = client.realtime.state;
    const offState = client.realtime.onState((s) => {
      if (s === 'online' && prev !== 'online') void resync();
      prev = s;
    });
    return () => {
      alive = false;
      off();
      offState();
    };
  }, [client, cid, reload, resync]);

  const outbox = useRef<Promise<void>>(Promise.resolve());
  const flushOne = useCallback(
    (p: Pending) => {
      outbox.current = outbox.current.then(async () => {
        setPending((l) => l.map((x) => (x.localId === p.localId ? { ...x, status: 'sending', error: undefined } : x)));
        try {
          const r = await client.rest.sendMessage(cid, { clientMsgId: p.clientMsgId, kind: 'text', body: p.body });
          const mine: Message = { id: r.id, cid, seq: r.seq, kind: 'text', body: p.body, createdAt: r.createdAt, mine: true };
          if (!msgs.current.some((m) => m.id === r.id)) {
            const gapBefore = r.seq > lastSeq() + 1 && lastSeq() > 0;
            msgs.current = merge(msgs.current, [mine]);
            setMessages(msgs.current);
            if (gapBefore) void resync(); // có tin của người khác bị lỡ trước tin của mình
          }
          setPending((l) => l.filter((x) => x.localId !== p.localId));
        } catch (e) {
          setPending((l) => l.map((x) => (x.localId === p.localId ? { ...x, status: 'failed', error: sendErrKey(e) } : x)));
        }
      });
    },
    [client, cid, resync]
  );

  const send = useCallback(
    (body: string) => {
      const p: Pending = { localId: uuid(), clientMsgId: uuid(), body, status: 'sending' };
      setPending((l) => [...l, p]);
      flushOne(p);
    },
    [flushOne]
  );
  const pend = useRef<Pending[]>([]);
  pend.current = pending;
  const resend = useCallback(
    (localId: string) => {
      const p = pend.current.find((x) => x.localId === localId);
      if (p && p.status === 'failed') flushOne(p);
    },
    [flushOne]
  );
  const discard = useCallback((localId: string) => setPending((l) => l.filter((x) => x.localId !== localId)), []);

  const recall = useCallback(
    async (id: string) => {
      await client.rest.recall(id);
      msgs.current = msgs.current.map((m) => (m.id === id ? { ...m, deleted: true, body: undefined } : m));
      setMessages(msgs.current);
    },
    [client]
  );
  const restore = useCallback(
    async (id: string) => {
      await client.rest.restore(id);
      // tin hoàn tác có seq CŨ nên resync(afterSeq=mới nhất) không thấy: tải đúng trang chứa nó rồi gộp theo id
      const seq = msgs.current.find((m) => m.id === id)?.seq;
      if (seq) {
        const page = await client.rest.listMessages(cid, { afterSeq: seq - 1 > 0 ? seq - 1 : undefined, limit: 1 });
        msgs.current = merge(msgs.current, page.messages.filter((m) => m.id === id));
        setMessages(msgs.current);
      }
    },
    [client, cid]
  );

  const loadOlder = useCallback(async () => {
    const first = msgs.current[0]?.seq;
    if (!first) return;
    const page = await client.rest.listMessages(cid, { beforeSeq: first });
    msgs.current = merge(msgs.current, page.messages);
    setMessages(msgs.current);
    setHasMore(page.hasMore);
  }, [client, cid]);

  const markRead = useCallback(() => {
    const s = lastSeq();
    if (s > 0) client.rest.markRead(cid, s).catch(() => undefined);
  }, [client, cid]);

  return { messages, pending, status, errState, hasMore, loadOlder, send, resend, discard, recall, restore, markRead, retry: () => setReload((n) => n + 1) };
}
