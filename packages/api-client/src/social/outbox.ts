/**
 * Hàng đợi gửi tin offline (dự án 4, spec 5.6 mục 4). Tin soạn lúc mất mạng nằm ở đây (IndexedDB; dự phòng
 * localStorage cho tin chữ) cùng `clientMsgId`; có mạng thì gửi lại ĐÚNG `clientMsgId` ⇒ Gateway trả tin cũ nếu đã nhận
 * (idempotent), nên rớt mạng giữa chừng không bao giờ sinh hai tin.
 *
 * - Gửi tuần tự trong từng cuộc trò chuyện (tin sau không vượt tin trước khi tin trước còn chờ); cuộc khác chạy song song.
 * - Lỗi tạm thời (mất mạng, hết giờ, 5xx, 429): giữ `pending`, tự hẹn gửi lại có lùi, và gửi lại khi socket `online`.
 * - Lỗi vĩnh viễn (bị chặn, không phải thành viên, tệp không hợp lệ…): `failed` + mã, giữ để nút "Gửi lại"/xóa; tin sau vẫn đi.
 * - 401 (đã thử làm mới) hoặc 426: dừng, KHÔNG đánh `failed` (không phải lỗi của tin).
 * - Tệp: tải lên MỘT lần, nhớ `attachmentId`; gửi tin lỗi thì lần sau không tải lại.
 */
import { SendMessageRequestSchema, type SendMessageRequest } from '@vietlearning/contracts/api';
import { GatewayRequestError } from '../index.js';
import type { SendMessageResponse } from './rest.js';
import { backoffDelay, type Scheduler } from './ws.js';

export type OutboxKind = 'text' | 'image' | 'voice';
export interface OutboxItem {
  cid: string;
  clientMsgId: string;
  kind: OutboxKind;
  body?: string;
  /** Tệp chờ tải lên (bị bỏ sau khi tải xong, thay bằng `attachmentId`) */
  blob?: Blob;
  attachmentId?: string;
  status: 'pending' | 'failed';
  error?: string;
  attempts: number;
  createdAt: number;
}
export type OutboxInput =
  | { cid: string; clientMsgId: string; kind: 'text'; body: string }
  | { cid: string; clientMsgId: string; kind: 'image' | 'voice'; blob: Blob };

export interface SentEvent extends SendMessageResponse {
  cid: string;
  clientMsgId: string;
}

export interface OutboxStore {
  load(): Promise<OutboxItem[]>;
  save(items: OutboxItem[]): Promise<void>;
}

const STORAGE_KEY = 'becutit.social.outbox';
export const OUTBOX_MAX = 200;

export function createMemoryStore(): OutboxStore {
  let snap: OutboxItem[] = [];
  return {
    load: async () => snap.map((i) => ({ ...i })),
    save: async (items) => {
      snap = items.map((i) => ({ ...i }));
    }
  };
}

interface KVLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/** Dự phòng: chỉ lưu được tin KHÔNG còn Blob (tin chữ, hoặc tệp đã tải lên); tin có Blob chưa tải bị bỏ */
export function createLocalStorageStore(ls: KVLike | undefined = (globalThis as { localStorage?: KVLike }).localStorage): OutboxStore {
  return {
    async load() {
      try {
        const raw = ls?.getItem(STORAGE_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? (parsed as OutboxItem[]).filter((i) => i && typeof i.clientMsgId === 'string' && typeof i.cid === 'string') : [];
      } catch {
        return [];
      }
    },
    async save(items) {
      try {
        const storable = items.filter((i) => !i.blob);
        if (storable.length) ls?.setItem(STORAGE_KEY, JSON.stringify(storable));
        else ls?.removeItem(STORAGE_KEY);
      } catch {
        /* kho đầy / bị chặn: giữ trong RAM */
      }
    }
  };
}

const IDB_NAME = 'becutit-social';
function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('outbox');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbStore(): OutboxStore {
  const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await idbOpen();
    try {
      return await new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction('outbox', mode).objectStore('outbox'));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  };
  return {
    load: async () => ((await run('readonly', (s) => s.get('items') as IDBRequest<OutboxItem[] | undefined>)) ?? []) as OutboxItem[],
    save: async (items) => void (await run('readwrite', (s) => s.put(items, 'items')))
  };
}

/** IndexedDB (giữ cả Blob); không có/hỏng thì localStorage */
export function createDefaultStore(): OutboxStore {
  let impl: OutboxStore | null = null;
  const pick = async (): Promise<OutboxStore> => {
    if (impl) return impl;
    if (typeof indexedDB !== 'undefined') {
      try {
        const s = idbStore();
        await s.load(); // thử mở
        impl = s;
        return s;
      } catch {
        /* rơi xuống localStorage */
      }
    }
    impl = createLocalStorageStore();
    return impl;
  };
  return {
    load: async () => (await pick()).load(),
    save: async (items) => (await pick()).save(items)
  };
}

export interface OutboxOptions {
  rest: {
    sendMessage(cid: string, req: SendMessageRequest): Promise<SendMessageResponse>;
    uploadAttachment(cid: string, blob: Blob, media: 'image' | 'voice'): Promise<{ attachmentId: string }>;
  };
  store?: OutboxStore;
  scheduler?: Scheduler;
  random?: () => number;
}

export interface Outbox {
  /** Đã nạp xong từ kho */
  readonly ready: Promise<void>;
  enqueue(input: OutboxInput): Promise<OutboxItem>;
  flush(): Promise<void>;
  retry(clientMsgId: string): Promise<void>;
  discard(clientMsgId: string): Promise<void>;
  pending(cid?: string): OutboxItem[];
  onChange(cb: () => void): () => void;
  onSent(cb: (e: SentEvent) => void): () => void;
  /** Tự gửi khi socket chuyển sang `online` */
  attach(realtime: { onState(cb: (s: string) => void): () => void }): () => void;
}

/** Mã lỗi luôn là lỗi của chính tin (gửi lại y nguyên cũng vô ích) */
const PERMANENT_CODES = new Set([
  'chat_duplicate',
  'storage_full',
  'attachment_invalid',
  'blocked',
  'not_a_member',
  'peer_unavailable',
  'adult_required',
  'age_required',
  'age_locked',
  'chat_restricted',
  'handle_required',
  'conversation_not_found',
  'forbidden'
]);

type Verdict = 'transient' | 'permanent' | 'halt';
function classify(err: unknown): { verdict: Verdict; code?: string } {
  if (!(err instanceof GatewayRequestError)) return { verdict: 'transient' };
  const { kind, status, code } = err;
  if (kind === 'unauthorized' || status === 401 || kind === 'update-required') return { verdict: 'halt', code };
  if (code && PERMANENT_CODES.has(code)) return { verdict: 'permanent', code };
  if (status !== undefined && status >= 400 && status < 500 && ![408, 425, 429].includes(status)) return { verdict: 'permanent', code: code ?? `http_${status}` };
  if (kind === 'invalid-request') return { verdict: 'permanent', code: code ?? 'invalid_request' };
  return { verdict: 'transient', code }; // offline, timeout, 5xx, 429, contract (gửi lại an toàn nhờ clientMsgId)
}

const defaultScheduler: Scheduler = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
  now: () => Date.now()
};

export function createOutbox(opts: OutboxOptions): Outbox {
  const store = opts.store ?? createDefaultStore();
  const sched = opts.scheduler ?? defaultScheduler;
  const random = opts.random ?? Math.random;
  let items: OutboxItem[] = [];
  const changeCbs = new Set<() => void>();
  const sentCbs = new Set<(e: SentEvent) => void>();
  let saveChain: Promise<void> = Promise.resolve();
  let running: Promise<void> | null = null;
  let again = false;
  let retryTimer: unknown = null;
  let retryAttempt = 0;
  let clock = 0;

  const ready = (async () => {
    try {
      const loaded = await store.load();
      const have = new Set(items.map((i) => i.clientMsgId));
      items = [...loaded.filter((i) => !have.has(i.clientMsgId)), ...items].sort((a, b) => a.createdAt - b.createdAt);
    } catch {
      /* kho hỏng: bắt đầu rỗng */
    }
  })();

  const fire = (): void => {
    for (const cb of [...changeCbs]) {
      try {
        cb();
      } catch {
        /* giao diện lỗi không lan ra */
      }
    }
  };
  const persist = (): Promise<void> => {
    const snap = items.map((i) => ({ ...i }));
    saveChain = saveChain.then(() => store.save(snap)).catch(() => {});
    return saveChain;
  };
  const mutated = async (): Promise<void> => {
    fire();
    await persist();
  };

  function scheduleRetry(): void {
    if (retryTimer != null) return;
    const delay = backoffDelay(retryAttempt++, random);
    retryTimer = sched.setTimeout(() => {
      retryTimer = null;
      void flush();
    }, delay);
  }

  /** Xử lý hàng của một cuộc trò chuyện. Trả `true` nếu gặp lỗi tạm thời (cần hẹn gửi lại) */
  async function drainConversation(cid: string): Promise<boolean> {
    let transient = false;
    for (;;) {
      const item = items.find((i) => i.cid === cid && i.status === 'pending');
      if (!item) return transient;
      try {
        if (item.kind !== 'text' && !item.attachmentId) {
          if (!item.blob) throw new GatewayRequestError('invalid-request', 'Tệp đính kèm không còn', 400, 'attachment_invalid');
          const up = await opts.rest.uploadAttachment(cid, item.blob, item.kind);
          item.attachmentId = up.attachmentId;
          item.blob = undefined;
          await persist();
        }
        const req: SendMessageRequest =
          item.kind === 'text'
            ? { clientMsgId: item.clientMsgId, kind: 'text', body: item.body ?? '' }
            : { clientMsgId: item.clientMsgId, kind: item.kind, attachmentId: item.attachmentId! };
        const res = await opts.rest.sendMessage(cid, req);
        items = items.filter((i) => i !== item);
        await mutated();
        const ev: SentEvent = { ...res, cid, clientMsgId: item.clientMsgId };
        for (const cb of [...sentCbs]) {
          try {
            cb(ev);
          } catch {
            /* giao diện lỗi không lan ra */
          }
        }
      } catch (err) {
        item.attempts++;
        const v = classify(err);
        if (v.verdict === 'permanent') {
          item.status = 'failed';
          item.error = v.code;
          await mutated();
          continue; // tin sau vẫn đi
        }
        await mutated();
        return v.verdict === 'transient' ? true : transient; // halt: dừng, không hẹn giờ
      }
    }
  }

  async function runOnce(): Promise<void> {
    await ready;
    const cids = [...new Set(items.filter((i) => i.status === 'pending').map((i) => i.cid))];
    const results = await Promise.all(cids.map((cid) => drainConversation(cid)));
    if (results.some(Boolean)) scheduleRetry();
    else if (!items.some((i) => i.status === 'pending')) {
      retryAttempt = 0;
      if (retryTimer != null) {
        sched.clearTimeout(retryTimer);
        retryTimer = null;
      }
    }
  }

  function flush(): Promise<void> {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          await runOnce();
        } while (again);
      } finally {
        running = null;
      }
    })();
    return running;
  }

  return {
    ready,
    async enqueue(input) {
      const base = { clientMsgId: input.clientMsgId, kind: input.kind };
      const probe = input.kind === 'text' ? { ...base, body: input.body } : { ...base, attachmentId: input.clientMsgId };
      const ok = SendMessageRequestSchema.safeParse(probe).success && /^[0-9a-f-]{36}$/i.test(input.cid);
      if (!ok || (input.kind !== 'text' && !input.blob)) throw new GatewayRequestError('invalid-request', 'Tin nhắn không hợp lệ');
      await ready;
      const existing = items.find((i) => i.clientMsgId === input.clientMsgId);
      if (existing) return { ...existing };
      if (items.length >= OUTBOX_MAX) throw new GatewayRequestError('invalid-request', 'Hàng đợi gửi đã đầy', undefined, 'outbox_full');
      const item: OutboxItem = {
        cid: input.cid,
        clientMsgId: input.clientMsgId,
        kind: input.kind,
        ...(input.kind === 'text' ? { body: input.body } : { blob: input.blob }),
        status: 'pending',
        attempts: 0,
        createdAt: Math.max(sched.now(), ++clock)
      };
      items.push(item);
      await mutated();
      return { ...item };
    },
    flush,
    async retry(clientMsgId) {
      await ready;
      const item = items.find((i) => i.clientMsgId === clientMsgId);
      if (!item) return;
      item.status = 'pending';
      item.error = undefined;
      await mutated();
      await flush();
    },
    async discard(clientMsgId) {
      await ready;
      items = items.filter((i) => i.clientMsgId !== clientMsgId);
      await mutated();
    },
    pending: (cid) => items.filter((i) => !cid || i.cid === cid).map((i) => ({ ...i })),
    onChange(cb) {
      changeCbs.add(cb);
      return () => changeCbs.delete(cb);
    },
    onSent(cb) {
      sentCbs.add(cb);
      return () => sentCbs.delete(cb);
    },
    attach(realtime) {
      return realtime.onState((s) => {
        if (s === 'online') void flush();
      });
    }
  };
}
