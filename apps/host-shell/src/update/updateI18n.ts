import { defineMessages } from '@vietlearning/state';

/**
 * Chuỗi giao diện cập nhật app (dự án 8, spec mục 5.8 — đúng từng chữ). Nằm ở chunk lười của mô-đun
 * cập nhật, KHÔNG vào `i18n.ts` của gói đầu. Các khóa `apk*` do Task 7 dùng khi nối luồng APK.
 */
export const updateMessages = defineMessages(
  {
    softTitle: 'Có bản mới {version}',
    softLater: 'Để sau',
    softUpdate: 'Cập nhật',
    whatsNew: 'Có gì mới',
    restartTitle: 'Đã tải xong bản mới',
    restartAction: 'Khởi động lại để cập nhật',
    downloading: 'Đang tải bản mới… {percent}%',
    forcedTitle: 'Cần cập nhật để học tiếp',
    forcedBody: 'Bản này đã cũ, máy chủ không còn hỗ trợ. Tiến độ của bạn vẫn được giữ an toàn.',
    forcedAction: 'Cập nhật ngay',
    forcedOffline: 'Cần cập nhật khi có mạng · Bài đã tải vẫn học được',
    apkReadyTitle: 'Đã tải xong bản mới {version}',
    apkInstall: 'Cài đặt',
    apkMeteredAsk: 'Bản cập nhật khoảng {size} MB. Tải bằng dữ liệu di động?',
    apkMeteredYes: 'Tải ngay',
    apkWaitWifi: 'Đợi Wi-Fi',
    apkAllowTitle: 'Cho phép Bé Cu Tít cài bản cập nhật',
    apkAllowBody: 'Android cần bạn bật "Cho phép từ nguồn này" một lần. Sau đó quay lại đây.',
    apkAllowAction: 'Mở Cài đặt',
    apkFailed: 'Không cập nhật được. Thử lại hoặc tải từ trang giới thiệu.',
    apkOpenPage: 'Mở trang tải',
    apkNoLink: 'Hãy tải bản mới từ trang giới thiệu Bé Cu Tít.',
    openStoreFailed: 'Không mở được cửa hàng. Hãy mở Google Play và tìm "Bé Cu Tít".',
    webReloadTitle: 'Có bản mới — tải lại?',
    webReloadAction: 'Tải lại'
  },
  {
    softTitle: 'A new version {version} is available',
    softLater: 'Later',
    softUpdate: 'Update',
    whatsNew: "What's new",
    restartTitle: 'The update is ready',
    restartAction: 'Restart to update',
    downloading: 'Downloading the update… {percent}%',
    forcedTitle: 'Please update to keep learning',
    forcedBody: 'This version is too old for our server. Your progress is safe.',
    forcedAction: 'Update now',
    forcedOffline: "Update needed when you're online · Downloaded lessons still work",
    apkReadyTitle: 'Version {version} is downloaded',
    apkInstall: 'Install',
    apkMeteredAsk: 'The update is about {size} MB. Download using mobile data?',
    apkMeteredYes: 'Download now',
    apkWaitWifi: 'Wait for Wi-Fi',
    apkAllowTitle: 'Allow Bé Cu Tít to install updates',
    apkAllowBody: 'Android needs you to turn on "Allow from this source" once. Then come back here.',
    apkAllowAction: 'Open Settings',
    apkFailed: 'The update failed. Try again or download it from the website.',
    apkOpenPage: 'Open download page',
    apkNoLink: 'Please download the new version from the Bé Cu Tít website.',
    openStoreFailed: "Couldn't open the store. Open Google Play and search for \"Bé Cu Tít\".",
    webReloadTitle: 'New version — reload?',
    webReloadAction: 'Reload'
  }
);

export type UpdateMessageKey = Parameters<ReturnType<typeof updateMessages.useT>>[0];
/** Khóa lỗi hiển thị được ở thẻ nhắc */
export type UpdateErrorKey = 'openStoreFailed' | 'apkNoLink' | 'apkFailed';
