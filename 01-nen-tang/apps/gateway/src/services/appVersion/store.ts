import { readFileSync } from 'node:fs';
import { AppVersionsConfigSchema, type AppVersionsConfig } from '@vietlearning/contracts/api';

export interface AppVersionStore {
  get(): AppVersionsConfig;
}

export interface AppVersionStoreOptions {
  file: string;
  /** Đọc lại tệp khi đã quá chừng này ms kể từ lần đọc trước (0 = mỗi lần get()) */
  ttlMs: number;
  /** Host được phép cho apkFile.url (APK_DOWNLOAD_HOSTS) */
  apkHosts: string[];
  log?: { error: (...args: unknown[]) => void };
  now?: () => number;
}

/** Đọc + kiểm tệp: JSON hợp lệ, đúng schema Zod (contract) và host của apkFile nằm trong danh sách cho phép */
function loadFile(file: string, apkHosts: string[]): AppVersionsConfig {
  const cfg = AppVersionsConfigSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  const apk = cfg.apk.apkFile;
  if (apk) {
    const host = new URL(apk.url).hostname.toLowerCase();
    if (!apkHosts.includes(host)) {
      throw new Error(`apkFile.url: host "${host}" không nằm trong APK_DOWNLOAD_HOSTS`);
    }
  }
  return cfg;
}

/**
 * Cấu hình phiên bản app (spec 5.3). Lúc tạo: đọc đồng bộ, sai ⇒ ném (Gateway không khởi động).
 * Sau đó: đọc lại khi quá TTL; sai ⇒ giữ bản tốt gần nhất + log lỗi (sửa tệp nhầm không làm sập Gateway đang chạy).
 */
export function createAppVersionStore(opts: AppVersionStoreOptions): AppVersionStore {
  const now = opts.now ?? Date.now;
  const hosts = opts.apkHosts.map((h) => h.toLowerCase());
  let current = loadFile(opts.file, hosts);
  let loadedAt = now();
  return {
    get() {
      if (now() - loadedAt >= opts.ttlMs) {
        // Đặt mốc trước khi đọc: tệp hỏng không bị đọc lại ở mọi request trong cùng TTL
        loadedAt = now();
        try {
          current = loadFile(opts.file, hosts);
        } catch (err) {
          opts.log?.error({ err, file: opts.file }, 'app-versions.json lỗi: giữ cấu hình tốt gần nhất');
        }
      }
      return current;
    }
  };
}
