/**
 * Shell Bus — cầu nối GoF Observer (14) giữa Host Shell và EventBus Singleton.
 * Hợp đồng sự kiện nằm ở packages/contracts (NAV_SCREEN_CHANGED_EVENT) — Contract-first.
 * Host cấp kênh này; MFE không cần biết nhau (Nguyên tắc 7: "Giao tiếp qua Event Bus").
 * Bản mobile & bản web dùng cùng hợp đồng sự kiện nhưng độc lập triển khai (2 shell riêng).
 */
import { EventBus } from '@vietlearning/shared';
import {
  NAV_SCREEN_CHANGED_EVENT,
  NavScreenChangedEvent,
  NavScreenChangedEventSchema,
  emitNavScreenChanged
} from '@vietlearning/contracts';

export const shellBus = EventBus.getInstance();

export type NavSource = NavScreenChangedEvent['source'];
export type NavTarget = NavScreenChangedEvent['to'];

/** Phát sự kiện điều hướng (đã validate schema trước khi emit) */
export function publishNav(payload: {
  to: NavTarget;
  from?: NavScreenChangedEvent['from'];
  source: NavSource;
  mainTab?: string;
}): void {
  emitNavScreenChanged(shellBus, {
    to: payload.to,
    from: payload.from,
    source: payload.source,
    mainTab: payload.mainTab
  });
}

/** Nhận sự kiện điều hướng (Observer) — trả về hàm hủy đăng ký */
export function subscribeNav(
  handler: (event: NavScreenChangedEvent) => void
): () => void {
  return shellBus.subscribe(NAV_SCREEN_CHANGED_EVENT, data => {
    const parsed = NavScreenChangedEventSchema.safeParse(data);
    if (parsed.success) handler(parsed.data);
  });
}

/** Dev-only: đổ log điều hướng lên window để nghiệm thu bằng trình duyệt */
export function installDevNavLog(): () => void {
  const tag = window as unknown as { __NAV_LOG?: NavScreenChangedEvent[] };
  if (!tag.__NAV_LOG) tag.__NAV_LOG = [];
  const unsub = subscribeNav(event => {
    tag.__NAV_LOG!.push(event);
    console.info('[ShellBus] screen_changed:', event.from ?? '(boot)', '→', event.to, `(${event.source})`);
  });
  return unsub;
}
