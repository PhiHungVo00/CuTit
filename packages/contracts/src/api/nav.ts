import { z } from 'zod';

/**
 * Hợp đồng sự kiện điều hướng Shell (Nguyên tắc 7 TDD: Host Shell cấp Event Bus)
 *
 * Mọi thay đổi màn hình trong Host Shell (mobile lẫn web) PHẢI phát sự kiện này qua
 * EventBus Singleton (@vietlearning/shared) theo GoF Observer (14). Việc khai báo
 * schema tại đây đảm bảo cả hai shell + MFE tương lai compile khớp chung một hợp đồng.
 */

export const NAV_SCREEN_CHANGED_EVENT = 'shell.nav.screen_changed' as const;

export const NAV_SCREEN_IDS = [
  'overview',
  'm1-chat',
  'm7-roleplay',
  'm5-drill',
  'm8-sentence',
  'm3-honorific',
  'm10-culture',
  'm4-vision',
  'm2-pitch',
  'm6-dialect',
  'm9-analytics',
  'm11-onboarding',
  'm12-preferences'
] as const;

export const NAV_SOURCE_IDS = [
  'sidebar',
  'bottom_tab',
  'drawer',
  'card',
  'subtab',
  'main_tab',
  'quick_action',
  'rail',
  'url',
  'programmatic'
] as const;

export const NavScreenChangedEventSchema = z.object({
  /** Màn hình đích (đã validate theo danh mục 12 màn + overview) */
  to: z.enum(NAV_SCREEN_IDS),
  /** Màn hình xuất phát (nếu có) */
  from: z.enum(NAV_SCREEN_IDS).optional(),
  /** Nguồn phát ra sự kiện để trace trong log nghiệm thu */
  source: z.enum(NAV_SOURCE_IDS),
  /** Tab chính của shell (khi chuyển nhóm) */
  mainTab: z.string().max(24).optional(),
  /** Thời điểm phát (epoch ms) */
  emittedAt: z.number().int().positive()
});

export type NavScreenChangedEvent = z.infer<typeof NavScreenChangedEventSchema>;

/** Phát sự kiện điều hướng qua EventBus — giảm rủi ro emit payload lệch schema */
export function emitNavScreenChanged(
  bus: { emit: (event: string, data: unknown) => void },
  payload: Omit<NavScreenChangedEvent, 'emittedAt'>
): void {
  const event: NavScreenChangedEvent = { ...payload, emittedAt: Date.now() };
  const parsed = NavScreenChangedEventSchema.safeParse(event);
  if (!parsed.success) {
    console.warn('[NavEvent] Payload không hợp lệ, bỏ qua phát:', parsed.error.issues);
    return;
  }
  bus.emit(NAV_SCREEN_CHANGED_EVENT, parsed.data);
}
