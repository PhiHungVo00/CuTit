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
 *
 * Tiến độ lộ trình (store riêng `becutit.progress`, GĐ1) dùng cùng cơ chế với một bóng thứ hai:
 * XP = phần tăng theo ngày (`xp.add`, chỉ thêm), bài/vượt unit = `lesson.progress`, đóng băng + đạt mục tiêu
 * = `day.mark`, số bài/đóng băng đang giữ/mục tiêu = `progress.set`. Không đồng bộ: giờ nhắc (theo máy),
 * lỗi gần đây, điểm thanh, số lần làm từng bài.
 */
import type { ProgressSnapshot, SyncEvent, SyncResponse } from '@vietlearning/contracts/api';
import { learnerStore, type Attempt, type LearnerState, type Preferences, type Profile, type SrsCard } from './index.js';
import { initialProgress, progressStore, type LessonRecord, type ProgressData } from './progress.js';

export const SYNC_STORAGE_KEY = 'becutit.sync';
const BATCH = 200;
const OUTBOX_MAX = 5000;
/**
 * Phiên bản NỘI DUNG hộp đồng ý theo khóa (đổi chữ trong hộp => tăng số). Bảng tra nội dung từng phiên bản:
 * docs/phap-ly/DANH-GIA-TAC-DONG.md mục “Sổ đồng ý”. voice 2 = nêu rõ Google Gemini, có thể ở ngoài Việt Nam.
 */
export const CONSENT_VERSIONS: Record<string, string> = { voice: '2', camera: '1' };
/** = TESTOUT_PREFIX của contracts (không import giá trị từ contracts để chunk đồng bộ không kéo Zod) */
const TESTOUT = 'testout:';
const XP_EVENT_MAX = 1000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

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

/** Bóng của tiến độ lộ trình (đã đưa vào hàng đợi) */
interface ProgressShadow {
  xpByDay: Record<string, number>;
  /** lessonId -> điểm 0–100 đã gửi (so theo đơn vị server để không gửi lại mãi vì làm tròn) */
  lessons: Record<string, number>;
  testedOut: string[];
  frozenDays: string[];
  goalDays: string[];
  /** JSON [lessonsDone, freezes, dailyGoal] */
  scalars: string;
  /** GĐ4: khóa huy hiệu đã gửi (thiếu ở bản ghi cũ => coi như rỗng) */
  badges?: string[];
}

const scalarsOf = (p: Pick<ProgressData, 'lessonsDone' | 'freezes' | 'dailyGoal'>) => JSON.stringify([p.lessonsDone, p.freezes, p.dailyGoal]);
const scoreOf = (best: number) => Math.max(0, Math.min(100, Math.round((Number.isFinite(best) ? best : 0) * 100)));

/** Bóng ứng với dữ liệu mặc định: máy mới không sinh sự kiện, người dùng cũ tải lên toàn bộ tiến độ */
function initialProgressShadow(): ProgressShadow {
  return { xpByDay: {}, lessons: {}, testedOut: [], frozenDays: [], goalDays: [], scalars: scalarsOf(initialProgress()) };
}

function progressShadowOf(p: ProgressData, goalDays: string[]): ProgressShadow {
  return {
    xpByDay: { ...p.xpByDay },
    lessons: Object.fromEntries(Object.entries(p.lessons).map(([id, l]) => [id, scoreOf(l.best)])),
    testedOut: Object.keys(p.testedOut),
    frozenDays: [...p.frozenDays],
    goalDays: [...goalDays],
    scalars: scalarsOf(p),
    badges: Object.keys(p.badges)
  };
}

interface Persisted {
  /** userId của tài khoản mà bóng/hàng đợi thuộc về (null = chưa biết) */
  owner: string | null;
  outbox: SyncEvent[];
  shadow: Shadow;
  /** thiếu ở bản ghi trước khi có đồng bộ tiến độ => coi như mặc định (tải lên tiến độ cũ) */
  progressShadow?: ProgressShadow;
  lastSyncAt: string | null;
  /**
   * Đã chuyển sang tài khoản khôi phục nhưng CHƯA kéo được dữ liệu của nó (mất mạng / app bị tắt giữa chừng).
   * Còn cờ này: không đưa dữ liệu máy cũ vào hàng đợi; lần gửi kế tiếp chỉ kéo và THAY dữ liệu.
   */
  replacePending?: boolean;
  /**
   * Dự án 3 Task 5 — đang gộp khách này (= owner lúc bắt đầu) vào tài khoản: đặt TRƯỚC khi gọi POST /v1/me/merge.
   * Server đã gộp nhưng phản hồi mất (mạng rớt) => lần sau phiên đổi sang tài khoản đích, engine NHẬN chủ mới và giữ bóng
   * (không tải lại toàn bộ dữ liệu máy dưới id sự kiện mới => không cộng XP hai lần).
   */
  mergeFrom?: string | null;
  /** Đăng xuất đang chờ mạng (sống qua lần mở lại app; Host gọi lại `signOut(logout)` khi thấy cờ này trong status) */
  signOutPending?: boolean;
}

export interface SyncStatus {
  pending: number;
  lastSyncAt: string | null;
  syncing: boolean;
  /** lỗi lần gửi gần nhất (vd. 'offline'); null = ổn */
  error: string | null;
  /** đăng xuất đang chờ mạng (hiện "Sẽ đăng xuất khi có mạng" + nút Hủy); về false khi xong hoặc khi hủy */
  signOutPending: boolean;
}

export type SignOutResult = 'done' | 'waiting-network' | 'cancelled';

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
  /** gọi sau khi resetLocal xóa dữ liệu trên máy (Host: hủy lịch nhắc học) */
  onLocalReset?: () => void;
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
  /**
   * Dự án 3 Task 5 — gộp khách trên máy này vào tài khoản (đề xuất A6.2(3)):
   * 1. đẩy HẾT hàng đợi lên khách (bắt buộc có mạng; lỗi => ném lỗi, hàng đợi và dữ liệu giữ nguyên, chưa gọi merge);
   * 2. `switchAccount()` = POST /v1/me/merge + lưu token đích, trả `{userId}` của đích;
   * 3. đổi chủ hàng đợi sang đích (KHÔNG xóa hàng đợi, KHÔNG tải lại dữ liệu máy);
   * 4. kéo ảnh chụp đã gộp từ server (gộp vào máy, không thay hẳn: dữ liệu chỉ có trên máy như lỗi gần đây được giữ).
   * `guestGone: true` (máy thứ ba nhận `merged-elsewhere`, hoặc phản hồi gộp bị mất): bỏ bước 1 — khách không còn —
   * hàng đợi cũ được gửi vào đích với nguyên `clientEventId` (server đã chép sổ chống trùng => không cộng hai lần).
   */
  mergeInto(switchAccount: () => Promise<{ userId: string }>, opts?: { guestGone?: boolean }): Promise<void>;
  /** Kéo dữ liệu máy khác về mỗi `intervalMs` (mặc định 5 phút) khi app đang hiện + mỗi lần app trở lại màn hình. Trả hàm dừng. */
  startPeriodicPull(intervalMs?: number): () => void;
  /**
   * Đăng xuất (máy dùng chung không lộ dữ liệu): đẩy hàng đợi, gọi `logout` (POST /v1/auth/logout), rồi xóa dữ liệu học trên máy.
   * Không đẩy được (offline/lỗi) => 'waiting-network': giữ nguyên mọi thứ, tự hoàn tất khi lần gửi sau thành công
   * (status.signOutPending; xong thì onLocalReset được gọi). KHÔNG có đường "vẫn đăng xuất" làm mất dữ liệu chưa đồng bộ.
   */
  signOut(logout?: () => Promise<unknown>): Promise<SignOutResult>;
  /** Hủy đăng xuất đang chờ. false = đã quá muộn (đang xóa dữ liệu) hoặc không có gì để hủy. */
  cancelSignOut(): boolean;
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
    case 'lesson.progress':
      return `lesson:${e.lessonId}`;
    case 'progress.set':
      return e.type;
    default:
      return null;
  }
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---------- engine ----------

let current: (SyncEngine & { enqueue(e: NewSyncEvent): void; wake(): void }) | null = null;

/**
 * Dự án 8: app bị bắt buộc cập nhật (Gateway trả 426) => tạm dừng ĐẨY và KÉO (kể cả kéo định kỳ) thay vì thử lại
 * liên tục. Sự kiện vẫn vào hàng đợi lưu bền. Cờ ở mức module nên sống qua việc khởi động lại engine.
 */
let pausedReason: 'update-required' | null = null;

export function pauseSync(reason: 'update-required'): void {
  pausedReason = reason;
}

export function resumeSync(): void {
  if (!pausedReason) return;
  pausedReason = null;
  current?.wake();
}

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
        if (r && Array.isArray(r.outbox) && r.shadow) return { ...r, progressShadow: r.progressShadow ?? initialProgressShadow() };
      }
    } catch {
      /* hỏng => làm lại từ mặc định */
    }
    return fresh();
  };
  const fresh = (): Persisted => ({ owner: null, outbox: [], shadow: shadowOf(learnerStore.getInitialState()), progressShadow: initialProgressShadow(), lastSyncAt: null });
  let rec = load();
  const pshadow = () => (rec.progressShadow ??= initialProgressShadow());
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

  /** đăng xuất: callback gọi /v1/auth/logout (chỉ trong bộ nhớ); đang ở bước xóa dữ liệu thì không hủy được nữa */
  let signOutLogout: (() => Promise<unknown>) | undefined;
  let signingOut: Promise<SignOutResult> | null = null;
  let wiping = false;
  const cleanups = new Set<() => void>();

  const status = (): SyncStatus => ({ pending: rec.outbox.length, lastSyncAt: rec.lastSyncAt, syncing, error, signOutPending: Boolean(rec.signOutPending) });
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
      push(ev({ type: 'consent.grant', key, version: CONSENT_VERSIONS[key] ?? '1' }));
      sh.consents.push(key);
      changed = true;
    }
    for (const key of [...sh.consents]) {
      if (s.consents[key]) continue;
      push(ev({ type: 'consent.revoke', key }));
      sh.consents = sh.consents.filter((k) => k !== key);
      changed = true;
    }
    const fresh = s.attempts.filter((a: Attempt) => !sh.attemptCursor || a.at > sh.attemptCursor);
    for (const a of fresh) {
      push(ev({ type: 'attempt.add', attempt: { skill: a.skill, correct: a.correct, ...(a.score == null ? {} : { score: a.score }), at: a.at } }));
      changed = true;
    }
    if (fresh.length) sh.attemptCursor = fresh[fresh.length - 1].at;
    if (scanProgress(s.activity, ev)) changed = true;

    if (changed) {
      save();
      notify();
      if (rec.outbox.length) schedule(debounceMs);
    }
  }

  /** So tiến độ lộ trình với bóng thứ hai => sự kiện. Trả true nếu có thay đổi. */
  function scanProgress(activity: Record<string, number>, ev: (body: NewSyncEvent) => SyncEvent): boolean {
    const p = progressStore.getState();
    const sh = pshadow();
    let changed = false;
    for (const [day, raw] of Object.entries(p.xpByDay)) {
      const value = Math.round(raw);
      let delta = value - Math.round(sh.xpByDay[day] ?? 0);
      if (delta === 0) continue;
      sh.xpByDay[day] = value;
      changed = true;
      // khóa ngày hỏng không gửi (một sự kiện sai làm cả lô bị 400 mãi); số âm (không xảy ra) bỏ qua
      if (!DAY_RE.test(day)) continue;
      while (delta > 0) {
        const amount = Math.min(XP_EVENT_MAX, delta);
        push(ev({ type: 'xp.add', source: 'path', amount, day }));
        delta -= amount;
      }
    }
    for (const [lessonId, l] of Object.entries(p.lessons)) {
      const score = scoreOf(l.best);
      if ((sh.lessons[lessonId] ?? -1) >= score) continue;
      sh.lessons[lessonId] = score;
      changed = true;
      if (lessonId.length >= 1 && lessonId.length <= 80) push(ev({ type: 'lesson.progress', lessonId, status: 'completed', score }));
    }
    for (const unit of Object.keys(p.testedOut)) {
      if (sh.testedOut.includes(unit)) continue;
      sh.testedOut.push(unit);
      changed = true;
      const lessonId = TESTOUT + unit;
      if (lessonId.length <= 80) push(ev({ type: 'lesson.progress', lessonId, status: 'completed', score: 100 }));
    }
    for (const day of p.frozenDays) {
      if (sh.frozenDays.includes(day)) continue;
      sh.frozenDays.push(day);
      changed = true;
      if (DAY_RE.test(day)) push(ev({ type: 'day.mark', day, freezeUsed: true }));
    }
    const need = p.dailyGoal * 60;
    for (const [day, seconds] of Object.entries(activity)) {
      if (!(seconds >= need) || sh.goalDays.includes(day)) continue;
      sh.goalDays.push(day);
      changed = true;
      if (DAY_RE.test(day)) push(ev({ type: 'day.mark', day, goalMet: true }));
    }
    const sentBadges = (sh.badges ??= []);
    for (const [key, b] of Object.entries(p.badges)) {
      if (sentBadges.includes(key)) continue;
      sentBadges.push(key);
      changed = true;
      if (/^[\w.:-]{1,60}$/.test(key)) push(ev({ type: 'achievement.earn', key, at: b.at }));
    }
    const scalars = scalarsOf(p);
    if (scalars !== sh.scalars) {
      sh.scalars = scalars;
      changed = true;
      push(ev({ type: 'progress.set', lessonsDone: Math.max(0, Math.floor(p.lessonsDone)), freezes: Math.max(0, Math.min(2, p.freezes)), dailyGoal: p.dailyGoal }));
    }
    return changed;
  }

  /** Áp phần tiến độ lộ trình của ảnh chụp (server là nguồn chuẩn cho tổng XP và các cờ ngày) */
  function applyProgress(snap: ProgressSnapshot, replace: boolean) {
    const p = progressStore.getState();
    const nowIso = now().toISOString();
    const lessons: Record<string, LessonRecord> = replace ? {} : { ...p.lessons };
    const testedOut: Record<string, string> = replace ? {} : { ...p.testedOut };
    for (const l of snap.lessons ?? []) {
      if (l.status !== 'completed') continue;
      if (l.lessonId.startsWith(TESTOUT)) {
        const unit = l.lessonId.slice(TESTOUT.length);
        testedOut[unit] ??= l.completedAt ?? nowIso;
        continue;
      }
      const best = Math.max(0, Math.min(1, (l.bestScore ?? 0) / 100));
      const cur = lessons[l.lessonId];
      lessons[l.lessonId] = cur ? { ...cur, best: Math.max(cur.best, best) } : { best, times: 1, at: l.completedAt ?? nowIso };
    }
    const flags = snap.dayFlags ?? { goalMet: [], frozen: [] };
    const frozenDays = [...new Set([...(replace ? [] : p.frozenDays), ...flags.frozen])].sort();
    const ps = snap.progressState ?? null;
    // huy hiệu: hợp (không bao giờ mất); về từ server => coi như đã báo (không thông báo lại trên máy này)
    const badges: ProgressData['badges'] = replace ? {} : { ...p.badges };
    for (const a of snap.achievements ?? []) badges[a.key] ??= { at: a.earnedAt, seen: true };
    const next: Partial<ProgressData> = {
      // hàng đợi đã rỗng khi áp => mọi XP của máy này đã có trên server; XP máy khác về theo
      xpByDay: snap.xp ? { ...snap.xp.byDay } : p.xpByDay,
      lessons,
      testedOut,
      frozenDays,
      badges,
      ...(ps
        ? { lessonsDone: ps.lessonsDone, freezes: ps.freezes, dailyGoal: ps.dailyGoal }
        : replace
          ? { lessonsDone: Object.keys(lessons).length, freezes: 0, dailyGoal: initialProgress().dailyGoal }
          : {}),
      ...(replace ? { mistakes: [], toneStats: {}, lessonsByDay: {}, knownAt: {}, toneWeek: null } : {})
    };
    progressStore.setState(next);
    const goalDays = [...new Set([...(replace ? [] : pshadow().goalDays), ...flags.goalMet])];
    // bóng huy hiệu = đã gửi trước đó ∪ server có; KHÔNG lấy từ store (subscriber có thể vừa trao huy hiệu mới
    // ngay trong lúc áp — huy hiệu đó phải còn được gửi ở lần quét sau)
    const sentBadges = [...new Set([...(replace ? [] : (pshadow().badges ?? [])), ...(snap.achievements ?? []).map((a) => a.key)])];
    rec.progressShadow = { ...progressShadowOf(progressStore.getState(), goalDays), badges: sentBadges };
  }

  function schedule(ms: number) {
    if (stopped || pausedReason) return;
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
      // Đồng ý: server là nguồn đúng (ảnh chụp chỉ được áp khi hàng đợi đã trống, nên mọi đồng ý/rút lại
      // của máy này đã lên server) => rút lại ở máy khác cũng có hiệu lực ở máy này.
      const consents: Record<string, boolean> = {};
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
      applyProgress(snap, replace);
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
    if (switching || pausedReason) return false;
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

        // Vẫn gửi thành công vào chính khách => server chắc chắn CHƯA gộp (khách đã gộp bị xóa, mọi request của nó bị từ chối):
        // bỏ dấu gộp dở, nếu không lần đổi chủ sau (khách bị xóa ở máy khác => khách mới) sẽ bị coi nhầm là gộp và không tải lại dữ liệu
        if (rec.mergeFrom && rec.owner === res.snapshot.userId) rec.mergeFrom = null;
        if (rec.owner && rec.owner !== res.snapshot.userId && rec.mergeFrom === rec.owner) {
          // Phản hồi gộp bị mất nhưng server đã gộp; phiên giờ là tài khoản đích: nhận chủ mới, GIỮ bóng (dữ liệu máy đã ở
          // trên khách => đã được gộp vào đích; hàng đợi vừa gửi giữ nguyên clientEventId nên không cộng hai lần)
          rec.owner = res.snapshot.userId;
          rec.mergeFrom = null;
        } else if (rec.owner && rec.owner !== res.snapshot.userId) {
          // Phiên đã chuyển sang tài khoản khách MỚI (tài khoản cũ bị xóa ở máy khác): tải lại toàn bộ dữ liệu máy
          rec.owner = res.snapshot.userId;
          rec.shadow = shadowOf(learnerStore.getInitialState());
          rec.progressShadow = initialProgressShadow();
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
      if (error === 'update-required') {
        pausedReason = 'update-required'; // 426: thử lại vô ích tới khi cập nhật (Host gọi resumeSync nếu cần)
        return false;
      }
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
    const p = inflight;
    // Đăng xuất đang chờ mạng: lần gửi thành công đầu tiên (online, thử lại theo backoff…) hoàn tất đăng xuất
    void p.then((ok) => {
      // Chỉ khi đã có callback logout (nằm trong RAM): mở lại app, Host chưa kịp gọi lại signOut(logout) thì KHÔNG xóa dữ liệu
      // máy mà bỏ qua thu hồi token (phiên vẫn sống trên server)
      if (ok && rec.signOutPending && signOutLogout && !signingOut && !stopped) void runSignOut();
    });
    return p;
  }

  /** Xóa dữ liệu học trên máy sau `fn` (DELETE /v1/me, logout). `requireEmpty`: còn sự kiện chưa gửi thì KHÔNG xóa. */
  async function wipeLocal(fn: (() => Promise<unknown>) | undefined, requireEmpty: boolean): Promise<boolean> {
    switching = true;
    clearTimeout(timer);
    try {
      await inflight?.catch(() => undefined);
      if (requireEmpty && rec.outbox.length) return false; // có sự kiện mới chen vào giữa lúc đẩy và lúc xóa
      wiping = true;
      await fn?.();
      applying = true;
      try {
        learnerStore.getState().reset();
        // tiến độ lộ trình (XP, bài đã xong, đóng băng, cài đặt nhắc) lưu ở khóa riêng: xóa cùng lúc
        progressStore.getState().resetProgress();
      } finally {
        applying = false;
      }
      rec = { ...fresh(), shadow: shadowOf(learnerStore.getState()) };
      error = null;
      try {
        opts.onLocalReset?.();
      } catch {
        /* hủy nhắc lỗi không chặn việc xóa */
      }
      return true;
    } finally {
      wiping = false;
      switching = false;
      save();
      notify();
    }
  }

  async function signOutOnce(): Promise<SignOutResult> {
    for (let i = 0; i < 3; i++) {
      const ok = await flush();
      if (!rec.signOutPending) return 'cancelled';
      if (!ok) return 'waiting-network';
      if (rec.outbox.length) continue; // thay đổi mới trong lúc gửi: gửi tiếp
      try {
        if (await wipeLocal(signOutLogout, true)) {
          signOutLogout = undefined;
          return 'done';
        }
      } catch (err) {
        // logout lỗi (mạng rớt đúng lúc): chưa xóa gì, thử lại khi có mạng
        error = (err as { kind?: string }).kind ?? 'error';
        backoff = Math.min(60_000, backoff ? backoff * 3 : 5_000);
        schedule(backoff);
        notify();
        return rec.signOutPending ? 'waiting-network' : 'cancelled';
      }
    }
    if (rec.signOutPending) schedule(debounceMs);
    return rec.signOutPending ? 'waiting-network' : 'cancelled';
  }

  function runSignOut(): Promise<SignOutResult> {
    signingOut ??= signOutOnce().finally(() => {
      signingOut = null;
    });
    return signingOut;
  }

  /** Phản hồi có thể đã mất sau khi server làm xong (mạng rớt / quá giờ / 5xx) — khác lỗi chắc chắn bị từ chối (409, 401…) */
  const maybeLost = (err: unknown) => {
    const kind = (err as { kind?: string } | null)?.kind;
    return kind === undefined || kind === 'offline' || kind === 'timeout' || kind === 'server';
  };

  const unsubscribe = learnerStore.subscribe(() => scan());
  const unsubscribeProgress = progressStore.subscribe(() => scan());
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
      await wipeLocal(deleteAccount, false);
    },
    async mergeInto(switchAccount: () => Promise<{ userId: string }>, o: { guestGone?: boolean } = {}) {
      if (!o.guestGone) {
        // 1. Đẩy hết hàng đợi lên khách. Không được => dừng TRƯỚC khi gộp (hàng đợi còn nguyên, thử lại được)
        for (let i = 0; i < 3 && (rec.outbox.length || i === 0); i++) {
          if (!(await flush())) throw Object.assign(new Error('sync failed before merge'), { kind: error ?? 'offline' });
        }
        if (rec.outbox.length) throw Object.assign(new Error('sync queue not drained before merge'), { kind: 'pending' });
      }
      switching = true;
      clearTimeout(timer);
      try {
        await inflight?.catch(() => undefined);
        rec.mergeFrom = rec.owner;
        save();
        let target: { userId: string };
        try {
          target = await switchAccount();
        } catch (err) {
          // Bị từ chối chắc chắn (vé hỏng, đích chờ xóa…) => không còn gộp dở. Mạng rớt => có thể server đã gộp: giữ dấu
          if (!maybeLost(err)) rec.mergeFrom = null;
          throw err;
        }
        // 3. Đổi chủ ngay khi có token đích (tắt app lúc này: lần mở sau chỉ gửi nốt + kéo, không tải lại dữ liệu máy)
        rec.owner = target.userId;
        rec.mergeFrom = null;
      } finally {
        switching = false;
        save();
        notify();
      }
      // 4. Kéo dữ liệu đã gộp (gửi nốt sự kiện phát sinh trong lúc gộp). Lỗi mạng => engine tự thử lại theo backoff
      await flush({ pull: true });
    },
    startPeriodicPull(intervalMs = 300_000) {
      const tick = async () => {
        if (stopped || switching || pausedReason || rec.signOutPending) return;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        // chưa có tài khoản trên máy => không kéo (kéo sẽ tạo khách lười)
        const has = opts.hasAccount ? await opts.hasAccount().catch(() => false) : true;
        if (has && !stopped && !switching) void flush({ pull: true });
      };
      const id = setInterval(() => void tick(), intervalMs);
      const onVisible = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') void tick();
      };
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
      const cleanup = () => {
        clearInterval(id);
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
        cleanups.delete(cleanup);
      };
      cleanups.add(cleanup);
      return cleanup;
    },
    async signOut(logout?: () => Promise<unknown>) {
      if (logout) signOutLogout = logout;
      if (!rec.signOutPending) {
        rec.signOutPending = true;
        save();
        notify();
      }
      return runSignOut();
    },
    cancelSignOut() {
      if (!rec.signOutPending || wiping) return false;
      rec.signOutPending = false;
      signOutLogout = undefined;
      save();
      notify();
      return true;
    },
    status,
    onStatus(cb: (s: SyncStatus) => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      [...cleanups].forEach((c) => c());
      unsubscribe();
      unsubscribeProgress();
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onOnline);
        document.removeEventListener('visibilitychange', onHidden);
      }
      if (current === engine) current = null;
    },
    wake() {
      if (rec.outbox.length || rec.replacePending) schedule(0);
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
