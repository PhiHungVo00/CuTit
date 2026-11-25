import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Tệp cấu hình phiên bản (`APP_VERSIONS_FILE`) RIÊNG của Gateway e2e (dự án 8). playwright.config.ts trỏ Gateway tới
 * tệp này với `APP_VERSIONS_TTL_MS=0` nên test ghi là Gateway thấy ngay ở request kế tiếp — đi đúng đường 426 thật,
 * không chặn bằng page.route. Tên theo cổng Gateway để nhiều worktree chạy e2e song song không giẫm nhau.
 */
const GATEWAY_PORT = Number(process.env.E2E_GATEWAY_PORT) || 4000;
export const VERSIONS_FILE = join(tmpdir(), `becutit-e2e-app-versions-${GATEWAY_PORT}.json`);

export interface ChannelConfig {
  latestBuild: number;
  latestVersion: string;
  minBuild: number;
  minBuildEnforceAt: string | null;
  notes: { vi: string; en: string } | null;
  downloadUrl: null;
  apkFile: null;
}

const ZERO: ChannelConfig = { latestBuild: 0, latestVersion: '0.0.0', minBuild: 0, minBuildEnforceAt: null, notes: null, downloadUrl: null, apkFile: null };

/** Ghi cấu hình cho cả 3 kênh (kênh không nêu = mặc định "không yêu cầu gì"); `web` là kênh của bản e2e */
export function writeVersions(web: Partial<ChannelConfig> = {}): void {
  writeFileSync(VERSIONS_FILE, JSON.stringify({ web: { ...ZERO, ...web }, play: ZERO, apk: ZERO }));
}
