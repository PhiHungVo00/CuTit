import type { ChannelUpdater } from './channel';

/**
 * Kênh APK cài tay — PHẦN TẠM của Task 5: chỉ mở trang tải dự phòng hoặc báo `apkNoLink`.
 * Task 7 thay bằng luồng tự tải/tự cài qua cầu nối native `ApkUpdater` (packages/native/src/apkUpdater.ts).
 */
async function openDownloadPage(r: Parameters<ChannelUpdater['softUpdate']>[0], hooks?: Parameters<ChannelUpdater['softUpdate']>[1]): Promise<void> {
  if (r.downloadUrl) {
    // `_system`: Capacitor mở bằng trình duyệt ngoài; Task 7 kiểm lại trên AVD
    window.open(r.downloadUrl, '_system');
    return;
  }
  hooks?.setError('apkNoLink');
}

export const updater: ChannelUpdater = {
  softUpdate: openDownloadPage,
  forcedUpdate: openDownloadPage
};
