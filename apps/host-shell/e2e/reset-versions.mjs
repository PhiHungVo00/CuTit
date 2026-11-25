import { writeFileSync } from 'node:fs';

// Chạy trước khi Gateway e2e khởi động (xem playwright.config.ts): tệp phải tồn tại và hợp lệ — store đọc đồng bộ
// lúc tạo, sai thì Gateway không lên. Nội dung = "không yêu cầu gì" (khớp ZERO trong e2e/versions.ts).
const zero = { latestBuild: 0, latestVersion: '0.0.0', minBuild: 0, minBuildEnforceAt: null, notes: null, downloadUrl: null, apkFile: null };
writeFileSync(process.env.APP_VERSIONS_FILE, JSON.stringify({ web: zero, play: zero, apk: zero }));
