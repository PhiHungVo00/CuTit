import type { ChannelUpdater } from './channel';

/**
 * Kênh web/PWA (spec 5.6): `registerType: 'prompt'` — SW mới đợi tới khi người dùng đồng ý.
 * - `onNeedRefresh` ⇒ nhắc mềm "Có bản mới — tải lại?".
 * - Review Focus 2: tab A bấm cập nhật ⇒ SW mới nhận quyền, precache cũ bị xóa ⇒ tab B (không bấm) nhận
 *   `controllerchange` và hiện thẻ tải lại thay vì gãy âm thầm vì thiếu chunk cũ.
 */
type UpdateSW = (reloadPage?: boolean) => Promise<void>;

let updateSW: UpdateSW | undefined;
let registration: ServiceWorkerRegistration | undefined;
/** Tab này tự chủ động cập nhật (sẽ tự tải lại) ⇒ không hiện thẻ "tải lại" */
let initiated = false;

const SIX_HOURS = 6 * 3600_000;

export interface WebHooks {
  onNeedRefresh(): void;
  /** SW điều khiển trang đổi mà không do tab này khởi xướng */
  onStaleTab(): void;
}

function checkForUpdate(): void {
  const reg = registration;
  if (!reg || reg.installing || !navigator.onLine) return;
  reg.update().catch(() => undefined);
}

export async function registerWeb(hooks: WebHooks): Promise<void> {
  const { registerSW } = await import('virtual:pwa-register');
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !initiated) hooks.onStaleTab();
  });
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh: hooks.onNeedRefresh,
    onRegisteredSW(_url, reg) {
      registration = reg;
      setInterval(checkForUpdate, SIX_HOURS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
    }
  });
}

function waitInstalled(reg: ServiceWorkerRegistration, ms: number): Promise<ServiceWorker | null> {
  const sw = reg.installing;
  if (!sw) return Promise.resolve(reg.waiting);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(t);
      sw.removeEventListener('statechange', onChange);
      resolve(reg.waiting);
    };
    const onChange = () => {
      if (sw.state === 'installed' || sw.state === 'redundant') done();
    };
    const t = setTimeout(done, ms);
    sw.addEventListener('statechange', onChange);
  });
}

/** Hỏi SW có bản mới không; có ⇒ kích hoạt + tải lại; không ⇒ tải lại trang (lấy lại index.html mới nhất) */
async function activate(): Promise<void> {
  initiated = true;
  const reg = registration;
  if (reg && updateSW) {
    try {
      await reg.update();
    } catch {
      /* offline giữa chừng: rơi xuống tải lại */
    }
    const waiting = reg.waiting ?? (await waitInstalled(reg, 8000));
    if (waiting) {
      await updateSW(true);
      return;
    }
  }
  location.reload();
}

export const updater: ChannelUpdater = {
  softUpdate: activate,
  forcedUpdate: activate
};
