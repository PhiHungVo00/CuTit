// Kiểu cho scripts/version.mjs (nguồn duy nhất của số phiên bản; dùng trong e2e/update.spec.ts)
export function versionToBuild(version: string): number;
export function readAppVersion(): { version: string; build: number };
