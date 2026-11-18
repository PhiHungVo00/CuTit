/**
 * Đồng bộ local-first (R7): mọi thay đổi vẫn ghi vào learnerStore trên máy NGAY, rồi được chuyển thành
 * sự kiện trong HÀNG ĐỢI GỬI (outbox, lưu bền) và đẩy lên POST /v1/sync khi có mạng.
 * Subpath riêng `@vietlearning/state/sync` — KHÔNG re-export từ index.ts để bundle đầu không kéo theo.
 *
 * Cách bắt thay đổi mà không phải sửa các action trong index.ts: so sánh store hiện tại với “bóng”
 * (shadow = dữ liệu đã đưa vào hàng đợi lần trước, lưu bền). Nhờ vậy:
 * - thay đổi xảy ra trước khi engine chạy (engine nạp lười) vẫn được bắt ở lần quét đầu;
 * - người dùng cũ chưa từng đồng bộ: bóng = mặc định => toàn bộ dữ liệu cũ được tải lên;
 * - máy mới: store = mặc định = bóng => KHÔNG sinh sự kiện mặc định đè dữ liệu server (LWW).
 *
 * Gộp: hồ sơ, tùy chỉnh, từng thẻ (itemRef), từng ngày học chỉ giữ sự kiện mới nhất trong hàng đợi.
 * Lượt làm bài dùng con trỏ thời gian (mảng bị cắt 1000 nên không so theo chỉ số).
 */
import type { ProgressSnapshot, SyncEvent, SyncResponse } from '@vietlearning/contracts/api';
import { learnerStore, type Attempt, type LearnerState, type Preferences, type Profile, type SrsCard } from './index.js';

export const SYNC_STORAGE_KEY = 'becutit.sync';
const BATCH = 200;
const OUTBOX_MAX = 5000;
const CONSENT_VERSION = '1';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** Sự kiện do tính năng khác (GĐ1: xp.add, lesson.progress, achievement.earn) đưa vào hàng đợi */
export type NewSyncEvent = DistributiveOmit<SyncEvent, 'clientEventId' | 'at'> & { at?: string };

interface Shadow {
  profile: Profile;
  preferences: Preferences;
  srs: Record<string, string>; // itemRef -> JSON thẻ
  activity: Record<string, number>;
  consents: string[];
  /** `at` của lượt làm bài mới nhất đã đưa vào hàng đợi */
  attemptCursor: string | null;
}

interface Persisted {
  /** userId của tài khoản mà bóng/hàng đợi thuộc về (null = chưa biết) */
  owner: string | null;
  outbox: SyncEvent[];
  shadow: Shadow;
  lastSyncAt: string | null;
  /**
   * Đã chuyển sang tài khoản khôi phục nhưng CHƯA kéo được dữ liệu của nó (mất mạng / app bị tắt giữa chừng).
   * Còn cờ này: không đưa dữ liệu máy cũ vào hàng đợi; lần gửi kế tiếp chỉ kéo và THAY dữ liệu.
   */
  replacePending?: boolean;
}

export interface SyncStatus {
  pending: number;
  lastSyncAt: string | null;
  syncing: boolean;
  /** lỗi lần gửi gần nhất (vd. 'offline'); null = ổn */
  error: string | null;
}

export interface SyncTransport {
  push(events: SyncEvent[]): Promise<SyncResponse>;
}

export interface SyncStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SyncOptions {
  transport: SyncTransport;
  /** có tài khoản trên máy chưa — chưa có thì không “kéo” lúc khởi động (tài khoản khách tạo lười) */
  hasAccount?: () => Promise<boolean>;
  storage?: SyncStorage;
  debounceMs?: number;
  now?: () => Date;
}

export interface SyncEngine {
  /** Gửi hàng đợi (và kéo ảnh chụp nếu `pull`); true = đã đồng bộ hết */
  flush(opts?: { pull?: boolean }): Promise<boolean>;
  /**
   * Đổi sang tài khoản khác trên máy này (khôi phục bằng mã): tạm dừng gửi, chạy `switchAccount`
   * (vd. session.recover), rồi bỏ hàng đợi cũ và THAY dữ liệu máy bằng dữ liệu server.
   * `switchAccount` lỗi (mã sai, mất mạng) => giữ nguyên dữ liệu + hàng đợi.
   */
  pullAndReplace(switchAccount?: () => Promise<unknown>): Promise<void>;
  /**
   * Xóa tài khoản: tạm dừng gửi, chạy `deleteAccount` (DELETE /v1/me) rồi xóa dữ liệu học trên máy,
   * hàng đợi và bóng (không đẩy lại dữ liệu đã xóa). `deleteAccount` lỗi => giữ nguyên mọi thứ.
   */
  resetLocal(deleteAccount?: () => Promise<unknown>): Promise<void>;
  status(): SyncStatus;
  onStatus(cb: (s: SyncStatus) => void): () => void;
  stop(): void;
}

// ---------- tiện ích ----------

function uuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function defaultStorage(): SyncStorage {
  const mem = new Map<string, string>();
  const ls = (() => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      return null;
    }
  })();
  return {
    getItem: (k) => {
      try {
        return ls ? ls.getItem(k) : (mem.get(k) ?? null);
      } catch {
        return mem.get(k) ?? null;
      }
    },
    setItem: (k, v) => {
      try {
        if (ls) ls.setItem(k, v);
        else mem.set(k, v);
      } catch {
        mem.set(k, v);
      }
    }
  };
}

const cardJson = (c: SrsCard) =>
  JSON.stringify([c.front, c.back, c.source, c.ease, c.intervalDays, c.repetitions, c.dueAt]);

function shadowOf(s: Pick<LearnerState, 'profile' | 'preferences' | 'srs' | 'activity' | 'consents' | 'attempts'>): Shadow {
  return {
    profile: { ...s.profile },
    preferences: { ...s.preferences },
    srs: Object.fromEntries(Object.values(s.srs).map((c) => [c.itemRef, cardJson(c)])),
    activity: { ...s.activity },
    consents: Object.keys(s.consents).filter((k) => s.consents[k]),
    attemptCursor: s.attempts.length ? s.attempts[s.attempts.length - 1].at : null
  };
}

/** Khóa gộp: sự kiện cùng khóa trong hàng đợi chỉ giữ bản mới nhất */
function coalesceKey(e: SyncEvent): string | null {
  switch (e.type) {
    case 'profile.set':
    case 'preferences.set':
      return e.type;
    case 'srs.upsert':
      return `srs:${e.card.itemRef}`;
    case 'activity.set':
      return `activity:${e.day}`;
    default:
      return null;
  }
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---------- engine ----------

let current: (SyncEngine & { enqueue(e: NewSyncEvent): void }) | null = null;

export function getSyncEngine(): SyncEngine | null {
  return current;
}

/**
 * GĐ1 (XP, bài học, huy hiệu) đưa sự kiện vào hàng đợi. Engine chưa chạy (nạp lười) => ghi thẳng vào
 * hàng đợi lưu bền, engine sẽ gửi khi khởi động.
 */
export function enqueueSyncEvent(e: NewSyncEvent, storage: SyncStorage = defaultStorage()): void {
  if (current) return current.enqueue(e);
  const raw = storage.getItem(SYNC_STORAGE_KEY);
  const rec: Persisted = raw ? JSON.parse(raw) : { owner: null, outbox: [], shadow: shadowOf(learnerStore.getInitialState()), lastSyncAt: null };
  rec.outbox.push({ ...e, clientEventId: uuid(), at: e.at ?? new Date().toISOString() } as SyncEvent);
  storage.setItem(SYNC_STORAGE_KEY, JSON.stringify(rec));
}

export function startSync(opts: SyncOptions): SyncEngine {
  current?.stop();
  const storage = opts.storage ?? defaultStorage();
  const now = opts.now ?? (() => new Date());
  const debounceMs = opts.debounceMs ?? 2000;

  const load = (): Persisted => {
    try {
      const raw = storage.getItem(SYNC_STORAGE_KEY);
      if (raw) {
        const r = JSON.parse(raw) as Persisted;
        if (r && Array.isArray(r.outbox) && r.shadow) return r;
      }
    } catch {
      /* hỏng => làm lại từ mặc định */
    }
    return { owner: null, outbox: [], shadow: shadowOf(learnerStore.getInitialState()), lastSyncAt: null };
  };
  let rec = load();
  const save = () => storage.setItem(SYNC_STORAGE_KEY, JSON.stringify(rec));

  const listeners = new Set<(s: SyncStatus) => void>();
  let syncing = false;
  let error: string | null = null;
  let applying = false;
  /** đang đổi/xóa tài khoản: không gửi gì */
  let switching = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let backoff = 0;
  let inflight: Promise<boolean> | null = null;

  const status = (): SyncStatus => ({ pending: rec.outbox.length, lastSyncAt: rec.lastSyncAt, syncing, error });
  const notify = () => listeners.forEach((cb) => cb(status()));

  function push(e: SyncEvent) {
    const key = coalesceKey(e);
    if (key) rec.outbox = rec.outbox.filter((x) => coalesceKey(x) !== key);
    rec.outbox.push(e);
    // Chặn phình bộ nhớ khi offline rất lâu: bỏ sự kiện cũ nhất (dữ liệu vẫn còn trên máy và trong bóng)
    if (rec.outbox.length > OUTBOX_MAX) rec.outbox.splice(0, rec.outbox.length - OUTBOX_MAX);
  }

  /** So store với bóng => sự kiện. Gọi sau mỗi thay đổi store. */
  function scan() {
    if (applying || stopped || rec.replacePending) return;
    const s = learnerStore.getState();
    const sh = rec.shadow;
    const at = now().toISOString();
    const ev = (body: NewSyncEvent) => ({ ...body, clientEventId: uuid(), at: body.at ?? at }) as SyncEvent;
    let changed = false;

    if (!sameJson(s.profile, sh.profile)) {
      const { onboarded, level, goal, nativeLang, dialect } = s.profile;
      push(ev({ type: 'profile.set', profile: { onboarded, level, goal, nativeLang, dialect } }));
      sh.profile = { ...s.profile };
      changed = true;
    }
    if (!sameJson(s.preferences, sh.preferences)) {
      push(ev({ type: 'preferences.set', preferences: { ...s.preferences } }));
      sh.preferences = { ...s.preferences };
      changed = true;
    }
    for (const c of Object.values(s.srs)) {
      const j = cardJson(c);
      if (sh.srs[c.itemRef] === j) continue;
      const { itemRef, front, back, source, ease, intervalDays, repetitions, dueAt } = c;
      push(ev({ type: 'srs.upsert', card: { itemRef, front, back, source, ease, intervalDays, repetitions, dueAt } }));
      sh.srs[c.itemRef] = j;
      changed = true;
    }
    for (const [day, seconds] of Object.entries(s.activity)) {
      if (sh.activity[day] === seconds || !(seconds > 0)) continue;
      push(ev({ type: 'activity.set', day, seconds: Math.min(86400, Math.round(seconds)) }));
      sh.activity[day] = seconds;
      changed = true;
    }
    for (const key of Object.keys(s.consents)) {
      if (!s.consents[key] || sh.consents.includes(key)) continue;
      push(ev({ type: 'consent.grant', key, version: CONSENT_VERSION }));
      sh.consents.push(key);
      changed = true;
    }
    const fresh = s.attempts.filter((a: Attempt) => !sh.attemptCursor || a.at > sh.attemptCursor);
    for (const a of fresh) {
      push(ev({ type: 'attempt.add', attempt: { skill: a.skill, correct: a.correct, ...(a.score == null ? {} : { score: a.score }), at: a.at } }));
      changed = true;
    }
    if (fresh.length) sh.attemptCursor = fresh[fresh.length - 1].at;

    if (changed) {
      save();
      notify();
      if (rec.outbox.length) schedule(debounceMs);
    }
  }

  function schedule(ms: number) {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), ms);
  }

  /** Áp ảnh chụp server vào store + bóng cùng lúc (không sinh sự kiện vọng lại). replace = thay hẳn thẻ */
  function applySnapshot(snap: ProgressSnapshot, replace: boolean) {
    applying = true;
    try {
      const s = learnerStore.getState();
      const srs: Record<string, SrsCard> = replace ? {} : { ...s.srs };
      for (const c of snap.srs) srs[c.itemRef] = { ...c };
      const activity: Record<string, number> = replace ? {} : { ...s.activity };
      for (const [d, sec] of Object.entries(snap.activity)) activity[d] = Math.max(activity[d] ?? 0, sec);
      const consents: Record<string, boolean> = replace ? {} : { ...s.consents };
      for (const c of snap.consents) consents[c.key] = true;
      const attempts = replace || snap.attempts.length >= s.attempts.length ? snap.attempts.map((a) => ({ ...a })) : s.attempts;
      learnerStore.setState({
        profile: snap.profile ? { ...snap.profile } : replace ? learnerStore.getInitialState().profile : s.profile,
        preferences: snap.preferences ? { ...snap.preferences } : s.preferences,
        srs,
        activity,
        consents,
        attempts
      });
      rec.shadow = shadowOf(learnerStore.getState());
      rec.owner = snap.userId;
      save();
    } finally {
      applying = false;
    }
  }

  async function replaceFromServer() {
    const res = await opts.transport.push([]);
    applySnapshot(res.snapshot, true);
    rec.replacePending = false;
    rec.lastSyncAt = now().toISOString();
    save();
  }

  async function doFlush(pull: boolean): Promise<boolean> {
    if (switching) return false;
    if (!rec.outbox.length && !pull && !rec.replacePending) return true;
    syncing = true;
    notify();
    try {
      if (rec.replacePending) {
        await replaceFromServer();
        error = null;
        backoff = 0;
        return true;
      }
      do {
        const batch = rec.outbox.slice(0, BATCH);
        const res = await opts.transport.push(batch);
        const done = new Set([...res.accepted, ...res.duplicates]);
        rec.outbox = rec.outbox.filter((e) => !done.has(e.clientEventId));
        rec.lastSyncAt = now().toISOString();
        if (rec.outbox.length) continue;

        if (rec.owner && rec.owner !== res.snapshot.userId) {
          // Phiên đã chuyển sang tài khoản khách MỚI (tài khoản cũ bị xóa ở máy khác): tải lại toàn bộ dữ liệu máy
          rec.owner = res.snapshot.userId;
          rec.shadow = shadowOf(learnerStore.getInitialState());
          save();
          scan();
          if (rec.outbox.length) continue;
        }
        applySnapshot(res.snapshot, false);
      } while (rec.outbox.length && !stopped);
      error = null;
      backoff = 0;
      return true;
    } catch (err) {
      error = (err as { kind?: string }).kind ?? 'error';
      backoff = Math.min(60_000, backoff ? backoff * 3 : 5_000);
      schedule(backoff);
      return false;
    } finally {
      syncing = false;
      save();
      notify();
    }
  }

  function flush(o: { pull?: boolean } = {}): Promise<boolean> {
    clearTimeout(timer);
    inflight ??= doFlush(Boolean(o.pull)).finally(() => {
      inflight = null;
    });
    return inflight;
  }

  const unsubscribe = learnerStore.subscribe(() => scan());
  const onOnline = () => void flush();
  const onHidden = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') void flush();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onHidden);
  }

  const engine = {
    flush,
    async pullAndReplace(switchAccount?: () => Promise<unknown>) {
      switching = true;
      clearTimeout(timer);
      try {
        await inflight?.catch(() => undefined);
        await switchAccount?.();
        rec.outbox = [];
        rec.replacePending = true;
        save();
        try {
          await replaceFromServer();
        } catch (err) {
          // Tài khoản đã đổi nhưng chưa kéo được dữ liệu: sẽ tự kéo + thay khi có mạng (không tải dữ liệu cũ lên)
          error = (err as { kind?: string }).kind ?? 'error';
          backoff = 5_000;
          schedule(backoff);
          throw err;
        }
        error = null;
      } finally {
        switching = false;
        save();
        notify();
        if (rec.outbox.length) schedule(debounceMs);
      }
    },
    async resetLocal(deleteAccount?: () => Promise<unknown>) {
      switching = true;
      clearTimeout(timer);
      try {
        await inflight?.catch(() => undefined);
        await deleteAccount?.();
        applying = true;
        try {
          learnerStore.getState().reset();
        } finally {
          applying = false;
        }
        rec = { owner: null, outbox: [], shadow: shadowOf(learnerStore.getState()), lastSyncAt: null };
        error = null;
      } finally {
        switching = false;
        save();
        notify();
      }
    },
    status,
    onStatus(cb: (s: SyncStatus) => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onOnline);
        document.removeEventListener('visibilitychange', onHidden);
      }
      if (current === engine) current = null;
    },
    enqueue(e: NewSyncEvent) {
      push({ ...e, clientEventId: uuid(), at: e.at ?? now().toISOString() } as SyncEvent);
      save();
      notify();
      schedule(debounceMs);
    }
  };
  current = engine;

  // Lần quét đầu: bắt mọi thay đổi chưa vào hàng đợi; có tài khoản thì kéo dữ liệu máy khác về
  scan();
  void (async () => {
    const has = opts.hasAccount ? await opts.hasAccount().catch(() => false) : true;
    if (stopped) return;
    if (has || rec.outbox.length || rec.replacePending) void flush({ pull: has });
  })();

  return engine;
}
