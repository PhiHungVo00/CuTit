import type { ChannelUpdater } from './channel';
import { safeHttpsUrl } from './safeUrl';

/**
 * Kênh APK cài tay — PHẦN TẠM của Task 5: chỉ mở trang tải dự phòng hoặc báo `apkNoLink`.
 * Task 7 thay bằng luồng tự tải/tự cài qua cầu nối native `ApkUpdater` (packages/native/src/apkUpdater.ts).
 */
async function openDownloadPage(r: Parameters<ChannelUpdater['softUpdate']>[0], hooks?: Parameters<ChannelUpdater['softUpdate']>[1]): Promise<void> {
  const url = safeHttpsUrl(r.downloadUrl);
  if (url) {
    // `_system`: Capacitor mở bằng trình duyệt ngoài; Task 7 kiểm lại trên AVD
    window.open(url, '_system');
    return;
  }
  hooks?.setError('apkNoLink');
}

export const updater: ChannelUpdater = {
  softUpdate: openDownloadPage,
  forcedUpdate: openDownloadPage
};
