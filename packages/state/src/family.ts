/**
 * GĐ4b — Chế độ trẻ em (D4), phía client. Subpath `@vietlearning/state/family` — KHÔNG re-export từ index.ts
 * (bundle đầu không kéo theo). Đây chỉ là LỚP NGOÀI: Gateway mới là nơi ép luật theo account_type.
 *
 * - `mode`: hồ sơ đang dùng trên máy là người lớn hay trẻ. Nguồn chuẩn = GET /v1/me/account (Host cập nhật).
 * - `mediaConsent`: phụ huynh đã cho phép trẻ gửi ảnh/ghi âm lên server chưa (server quyết định).
 * - `names`: biệt danh hồ sơ trẻ — CHỈ lưu trên máy này (server không giữ tên trẻ).
 * - `pin`: cổng phụ huynh. Chỉ lưu PBKDF2-SHA256 (muối ngẫu nhiên, nhiều vòng) — KHÔNG lưu PIN thô.
 *   Sai liên tiếp => khóa tăng dần (chống trẻ thử lần lượt).
 * MFE đọc qua `useIsChild()` / `useChildMedia()` (State Slice do Host cấp, Nguyên tắc 7).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from './index.js';

export interface PinRecord {
  /** base64 */
  salt: string;
  /** base64 của PBKDF2 */
  hash: string;
  iterations: number;
}

export interface FamilyData {
  mode: 'adult' | 'child';
  /** id hồ sơ trẻ đang dùng (mode = child) */
  activeChildId: string | null;
  mediaConsent: boolean;
  /** childId -> biệt danh (chỉ trên máy) */
  names: Record<string, string>;
  /** số hồ sơ trẻ của phụ huynh (để cảnh báo khi xóa tài khoản) */
  childCount: number;
  pin: PinRecord | null;
  failedAttempts: number;
  /** epoch ms; 0 = không khóa */
  lockedUntil: number;
}

export interface FamilyState extends FamilyData {
  setAccount(a: { mode: 'adult' | 'child'; mediaConsent: boolean; childCount?: number; activeChildId?: string | null }): void;
  setName(childId: string, name: string): void;
  forgetChild(childId: string): void;
  setPin(pin: PinRecord): void;
  /** Ghi nhận một lần nhập PIN; trả true nếu đúng */
  recordAttempt(ok: boolean, now?: number): void;
  resetFamily(): void;
}

const initial = (): FamilyData => ({
  mode: 'adult',
  activeChildId: null,
  mediaConsent: true,
  names: {},
  childCount: 0,
  pin: null,
  failedAttempts: 0,
  lockedUntil: 0
});

export const FAMILY_STORAGE_KEY = 'becutit.family';
export const PIN_MIN = 4;
export const PIN_MAX = 8;
const FREE_ATTEMPTS = 3;

/** Khóa sau lần sai thứ 4: 30 s, rồi gấp đôi (tối đa 15 phút) */
export function lockMs(failed: number): number {
  if (failed <= FREE_ATTEMPTS) return 0;
  return Math.min(15 * 60_000, 30_000 * 2 ** (failed - FREE_ATTEMPTS - 1));
}

export const familyStore = create<FamilyState>()(
  persist(
    (set) => ({
      ...initial(),
      setAccount: (a) =>
        set((s) => ({
          mode: a.mode,
          mediaConsent: a.mode === 'adult' ? true : a.mediaConsent,
          childCount: a.childCount ?? s.childCount,
          activeChildId: a.activeChildId !== undefined ? a.activeChildId : a.mode === 'adult' ? null : s.activeChildId
        })),
      setName: (childId, name) => set((s) => ({ names: { ...s.names, [childId]: name.trim().slice(0, 30) } })),
      forgetChild: (childId) =>
        set((s) => {
          const names = { ...s.names };
          delete names[childId];
          return { names, childCount: Math.max(0, s.childCount - 1) };
        }),
      setPin: (pin) => set({ pin, failedAttempts: 0, lockedUntil: 0 }),
      recordAttempt: (ok, now = Date.now()) =>
        set((s) => {
          if (ok) return { failedAttempts: 0, lockedUntil: 0 };
          const failed = s.failedAttempts + 1;
          const ms = lockMs(failed);
          return { failedAttempts: failed, lockedUntil: ms ? now + ms : 0 };
        }),
      resetFamily: () => set(initial())
    }),
    { name: FAMILY_STORAGE_KEY, version: 1, storage: createJSONStorage(safeStorage) }
  )
);

/** Hồ sơ đang dùng là của trẻ (giao diện khóa chat tự do, camera/ghi âm khi chưa được phép, …) */
export function useIsChild(): boolean {
  return familyStore((s) => s.mode === 'child');
}

/** Được gửi ảnh/ghi âm lên server không (người lớn: luôn được; trẻ: khi phụ huynh đã cho phép) */
export function useMediaAllowed(): boolean {
  return familyStore((s) => s.mode === 'adult' || s.mediaConsent);
}

// ---------- PIN phụ huynh ----------

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const isValidPin = (pin: string) => new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin);

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return b64(new Uint8Array(bits));
}

export async function hashPin(pin: string, iterations = 210_000): Promise<PinRecord> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return { salt: b64(salt), hash: await derive(pin, salt, iterations), iterations };
}

export async function verifyPin(pin: string, rec: PinRecord): Promise<boolean> {
  const got = await derive(pin, unb64(rec.salt), rec.iterations);
  // so sánh thời gian hằng (độ dài cố định)
  let diff = got.length ^ rec.hash.length;
  for (let i = 0; i < Math.min(got.length, rec.hash.length); i++) diff |= got.charCodeAt(i) ^ rec.hash.charCodeAt(i);
  return diff === 0;
}

// ---------- Lỗi 403 của chế độ trẻ em (FAMILY_ERROR trong contracts) ----------
// Đặt ở đây (chunk lười) thay vì api-client: bảng lỗi của api-client nằm trong bundle đầu.
const FAMILY_TEXT: Record<'vi' | 'en', Record<string, string>> = {
  vi: {
    child_free_chat_blocked: 'Hồ sơ của bé chỉ dùng nhập vai có kịch bản thôi nhé.',
    parent_consent_required: 'Cần bố mẹ cho phép thì mới gửi ảnh hoặc giọng nói được nhé.',
    adult_only: 'Phần này dành cho bố mẹ.'
  },
  en: {
    child_free_chat_blocked: 'Kids’ profiles can only use scripted role-play.',
    parent_consent_required: 'A parent needs to allow sending photos or voice first.',
    adult_only: 'This part is for parents.'
  }
};

/** Câu thân thiện cho lỗi 403 của chế độ trẻ em; null = không phải lỗi chế độ trẻ em */
export function familyErrorText(err: unknown, lang: 'vi' | 'en'): string | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(FAMILY_TEXT.vi, code) ? FAMILY_TEXT[lang][code] : null;
}
