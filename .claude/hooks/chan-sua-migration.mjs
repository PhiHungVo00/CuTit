// PreToolUse (Edit|Write|MultiEdit): chặn sửa migration ĐÃ PHÁT HÀNH (đã có trên origin/main).
// Migration mới (chưa có trên main) và meta/_journal.json vẫn sửa được (sinh migration mới cần sửa journal).
import { execFileSync } from 'node:child_process';
import path from 'node:path';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0); // không đọc được đầu vào => không chặn
}
const file = input?.tool_input?.file_path;
if (!file) process.exit(0);

const norm = file.replace(/\\/g, '/');
const m = norm.match(/apps\/gateway\/drizzle\/(?:meta\/\d{4}_snapshot\.json|\d{4}_[^/]+\.sql)$/);
if (!m) process.exit(0);

const cwd = path.dirname(file);
let rel;
try {
  const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim().replace(/\\/g, '/');
  rel = path.posix.relative(top, norm);
} catch {
  process.exit(0);
}
let released = false;
try {
  execFileSync('git', ['cat-file', '-e', `origin/main:${rel}`], { cwd, stdio: 'ignore' });
  released = true;
} catch {
  released = false;
}
if (!released) process.exit(0);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `Không sửa migration đã phát hành (${rel} đã có trên origin/main). Đổi schema ở packages/contracts/src/db/schema.ts rồi sinh migration MỚI: pnpm --filter @vietlearning/gateway db:generate --name <ten>. Gộp nhánh bị trùng số thì xóa migration của nhánh vào sau và sinh lại (skill kiem-truoc-khi-gop).`
    }
  })
);
