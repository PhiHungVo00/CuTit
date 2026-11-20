// PreToolUse (Bash, chỉ `git commit`): chặn commit khi AGENTS.md đã stage mà bản stage XÓA mục
// "Quy Lệnh Chuẩn & Kiểm Thử" — dấu hiệu turbo tự sửa AGENTS.md lúc `pnpm build` (R13).
import { execFileSync } from 'node:child_process';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}
const cmd = input?.tool_input?.command ?? '';
if (!/\bgit\b[^|;&]*\bcommit\b/.test(cmd)) process.exit(0);

const cwd = input?.cwd || process.cwd();
let diff = '';
try {
  diff = execFileSync('git', ['diff', '--cached', '--', 'AGENTS.md'], { cwd, encoding: 'utf8' });
} catch {
  process.exit(0);
}
// git commit -a / --all cũng đưa thay đổi chưa stage vào commit
if (/\s(-a|--all|-am)\b/.test(cmd)) {
  try {
    diff += execFileSync('git', ['diff', '--', 'AGENTS.md'], { cwd, encoding: 'utf8' });
  } catch {
    /* bỏ qua */
  }
}
const removedSection = diff.split('\n').some((l) => l.startsWith('-') && !l.startsWith('---') && l.includes('Quy Lệnh Chuẩn'));
if (!removedSection) process.exit(0);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        'AGENTS.md đang bị turbo tự sửa (mất mục "Quy Lệnh Chuẩn & Kiểm Thử" sau `pnpm build`, lỗi R13). Chạy `git checkout -- AGENTS.md` (hoặc `git restore --staged AGENTS.md` rồi checkout) trước khi commit.'
    }
  })
);
