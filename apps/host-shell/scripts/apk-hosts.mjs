/**
 * Danh sách host được phép tải APK cập nhật (dự án 8). PHẢI khớp `APK_DOWNLOAD_HOSTS` của Gateway.
 * Đọc từ biến môi trường lúc build, tách dấu phẩy; trả mảng host chữ thường, không trùng, bỏ ô trống.
 * capacitor.config.ts đưa mảng này vào `plugins.ApkUpdater.allowedHosts`; bản release rỗng ⇒ native từ chối mọi URL.
 */
export function parseApkHosts(raw) {
  const out = [];
  for (const part of String(raw ?? '').split(',')) {
    const h = part.trim().toLowerCase();
    if (h && !out.includes(h)) out.push(h);
  }
  return out;
}
