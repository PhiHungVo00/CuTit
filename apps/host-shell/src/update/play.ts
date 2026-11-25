import type { AppUpdateInfo } from '@capawesome/capacitor-app-update';
import type { ChannelUpdater, UpdaterHooks } from './channel';

/**
 * Kênh Google Play (spec 5.5): Play In-App Updates qua `@capawesome/capacitor-app-update` (MIT, bảo trì bởi
 * Capawesome). Plugin chỉ được `import()` ở đây — không có trong gói web đầu. Bản cài ngoài Play (sideload)
 * hoặc Play chưa biết bản mới ⇒ plugin báo không khả dụng ⇒ rơi về mở trang cửa hàng (không crash).
 */
async function plugin() {
  return import('@capawesome/capacitor-app-update');
}

async function openStore(hooks?: UpdaterHooks): Promise<void> {
  try {
    const { AppUpdate } = await plugin();
    await AppUpdate.openAppStore();
  } catch {
    hooks?.setError('openStoreFailed');
  }
}

async function info(): Promise<AppUpdateInfo | null> {
  try {
    return await (await plugin()).AppUpdate.getAppUpdateInfo();
  } catch {
    return null; // không phải bản cài từ Play / plugin lỗi
  }
}

const UPDATE_AVAILABLE = 2; // AppUpdateAvailability.UPDATE_AVAILABLE
const DOWNLOADING = 2; // FlexibleUpdateInstallStatus.DOWNLOADING
const DOWNLOADED = 11;
const FAILED = 5;
const CANCELED = 6;

export const updater: ChannelUpdater = {
  async softUpdate(_r, hooks) {
    const i = await info();
    if (!i || i.updateAvailability !== UPDATE_AVAILABLE || !i.flexibleUpdateAllowed) return openStore(hooks);
    const { AppUpdate } = await plugin();
    try {
      await AppUpdate.addListener('onFlexibleUpdateStateChange', (s) => {
        if (s.installStatus === DOWNLOADING) {
          const pct = s.totalBytesToDownload ? Math.floor(((s.bytesDownloaded ?? 0) / s.totalBytesToDownload) * 100) : 0;
          hooks?.setProgress(Math.min(100, Math.max(0, pct)));
        } else if (s.installStatus === DOWNLOADED) {
          hooks?.setProgress(null);
          hooks?.setReady(() => AppUpdate.completeFlexibleUpdate());
        } else if (s.installStatus === FAILED || s.installStatus === CANCELED) {
          hooks?.setProgress(null);
        }
      });
      hooks?.setProgress(0);
      await AppUpdate.startFlexibleUpdate();
    } catch {
      hooks?.setProgress(null);
      await openStore(hooks);
    }
  },

  async forcedUpdate(_r, hooks) {
    const i = await info();
    if (i && i.updateAvailability === UPDATE_AVAILABLE && i.immediateUpdateAllowed) {
      try {
        const { AppUpdate } = await plugin();
        await AppUpdate.performImmediateUpdate();
        return;
      } catch {
        /* rơi xuống mở cửa hàng */
      }
    }
    await openStore(hooks);
  }
};
