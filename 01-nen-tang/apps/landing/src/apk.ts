import { existsSync, readFileSync } from 'node:fs';

/** Thông tin bản APK ký phát hành (do bước phát hành ghi vào 01-nen-tang/apps/landing/apk-release.json) */
export type ApkRelease = { version: string; url: string; bytes: number; sha256: string; minAndroid: string };

/**
 * Đọc apk-release.json lúc build. Thiếu tệp, JSON hỏng hoặc thiếu/sai trường => null kèm cảnh báo
 * (build KHÔNG vỡ; trang hiện "Sắp có"). Chỉ chạy trong Node lúc build, không vào gói trình duyệt.
 */
export function readApkRelease(path: string): ApkRelease | null {
  if (!existsSync(path)) {
    console.warn(`[landing] Không có ${path}: nút Tải APK sẽ hiện "Sắp có".`);
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    console.warn(`[landing] ${path} không phải JSON hợp lệ: nút Tải APK sẽ hiện "Sắp có".`);
    return null;
  }
  const o = raw as Record<string, unknown> | null;
  const text = (k: string) => (typeof o?.[k] === 'string' && (o[k] as string).trim() !== '' ? (o[k] as string) : null);
  const version = text('version');
  const url = text('url');
  const minAndroid = text('minAndroid');
  const sha256 = text('sha256');
  const bytes = o?.bytes;
  const ok =
    version && url && minAndroid && sha256 && /^[0-9a-f]{64}$/i.test(sha256) && typeof bytes === 'number' && Number.isFinite(bytes) && bytes > 0;
  if (!ok) {
    console.warn(`[landing] ${path} thiếu hoặc sai trường (version, url, bytes, sha256, minAndroid): nút Tải APK sẽ hiện "Sắp có".`);
    return null;
  }
  return { version, url, bytes, sha256: sha256.toLowerCase(), minAndroid };
}

/** Cỡ tệp hiển thị theo MB, 1 chữ số thập phân (1 MB = 1024*1024 byte) */
export function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
