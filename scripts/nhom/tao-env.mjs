#!/usr/bin/env node
/**
 * Tạo / cập nhật tệp khóa AI CÁ NHÂN cho Gateway (NHOM-2).
 * Chạy:  node scripts/nhom/tao-env.mjs
 *
 * Gateway đọc cấu hình bí mật theo thứ tự (apps/gateway/src/config.ts): biến môi trường → apps/gateway/.env →
 * %USERPROFILE%\.becutit\gateway.env (đổi vị trí bằng BECUTIT_ENV_FILE). Script này ghi vào tệp THỨ BA — nằm NGOÀI repo,
 * dùng chung cho mọi bản clone trên máy, nên không thể vô tình commit.
 *
 * An toàn:
 *  - Khóa được gõ ẩn (không hiện chữ), KHÔNG bao giờ in ra màn hình hay ghi vào log. Chỉ hiển thị "đã nhận (N ký tự)".
 *  - Từ chối ghi nếu tệp đích nằm trong thư mục repo mà chưa được .gitignore bỏ qua (git check-ignore).
 *  - Mọi khóa đều có thể bỏ qua (Enter). Không có khóa nào => Gateway vẫn chạy ở chế độ giả lập.
 *  - Mỗi bạn tự tạo khóa của MÌNH; đừng gửi khóa cho nhau, đừng dán vào chat/Git.
 *
 * Tùy chọn:  --file <đường dẫn>   ghi vào tệp khác (vd. để thử);  --kiem-tra   chỉ báo tệp đích hiện có những khóa nào (không in giá trị).
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const NEW_LAYOUT = existsSync(join(ROOT, '01-nen-tang'));
const GATEWAY_DIR = join(ROOT, NEW_LAYOUT ? join('01-nen-tang', 'apps', 'gateway') : join('apps', 'gateway'));

const argv = process.argv.slice(2);
const argVal = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const TARGET = resolve(argVal('--file') ?? process.env.BECUTIT_ENV_FILE ?? join(homedir(), '.becutit', 'gateway.env'));

const BEGIN = '# >>> tao-env (tự sinh, chạy lại script sẽ ghi đè khối này) >>>';
const END = '# <<< tao-env <<<';

const KEYS = [
  {
    env: 'GEMINI_API_KEY',
    ten: 'Gemini (Google)',
    trang: 'https://aistudio.google.com/apikey',
    luu: 'Đăng nhập tài khoản Google → "Create API key". Gói miễn phí có giới hạn số yêu cầu/phút và /ngày (thay đổi theo thời gian, xem trang chính thức); đôi khi báo 503 "đang bận".'
  },
  {
    env: 'GROQ_API_KEY',
    ten: 'Groq',
    trang: 'https://console.groq.com/keys',
    luu: 'Đăng ký → "Create API Key". Gói miễn phí nhanh nhưng chỉ ~8 000 token/phút (khoảng vài lượt chat/phút) → gặp 429 là bình thường; Gateway tự chuyển sang nguồn khác.'
  },
  {
    env: 'OPENROUTER_API_KEY',
    ten: 'OpenRouter',
    trang: 'https://openrouter.ai/keys',
    luu: 'Đăng ký → "Create Key". Model có đuôi ":free" giới hạn ~20 yêu cầu/phút, và ~50 yêu cầu/NGÀY nếu chưa nạp tiền. Không cần nạp tiền để thử.'
  }
];

/** Chuỗi dự phòng khuyến nghị trong .env.example, chỉ giữ nguồn có khóa */
function buildChains(have) {
  const llm = [];
  const stt = [];
  if (have.GROQ_API_KEY) {
    llm.push('groq:qwen/qwen3.8-27b', 'groq:openai/gpt-oss-120b');
    stt.push('groq:whisper-large-v3-turbo');
  }
  if (have.GEMINI_API_KEY) {
    llm.push('gemini');
    stt.push('gemini');
  }
  if (have.OPENROUTER_API_KEY) llm.push('openrouter:google/gemma-4-31b-it:free');
  const lines = [];
  if (llm.length) lines.push(`LLM_CHAIN=${llm.join(',')}`);
  if (stt.length) lines.push(`STT_CHAIN=${stt.join(',')}`);
  // VISION_CHAIN không đặt: Gateway tự chọn theo khóa đang có
  return lines;
}

// ---------------------------------------------------------------- an toàn tệp đích
function insideRepo(p) {
  const rel = relative(ROOT, p);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
function gitIgnored(p) {
  const r = spawnSync('git', ['check-ignore', '-q', '--', p], { cwd: ROOT, windowsHide: true });
  return r.status === 0;
}
function assertSafeTarget() {
  if (!insideRepo(TARGET)) return;
  if (gitIgnored(TARGET)) return;
  console.error(`\n✘ Từ chối: tệp đích nằm TRONG repo và chưa được .gitignore bỏ qua:\n  ${TARGET}\n  Khóa ở đó có thể bị commit nhầm lên GitHub (repo công khai).\n  Hãy bỏ --file / BECUTIT_ENV_FILE để dùng mặc định ngoài repo: ${join(homedir(), '.becutit', 'gateway.env')}\n`);
  process.exit(2);
}

// ---------------------------------------------------------------- đọc / ghi tệp env
function parseEnv(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (m) map.set(m[1], m[2].trim());
  }
  return map;
}

function stripManagedBlock(text) {
  const a = text.indexOf(BEGIN);
  const b = text.indexOf(END);
  if (a < 0 || b < a) return text;
  return (text.slice(0, a) + text.slice(b + END.length)).replace(/\n{3,}/g, '\n\n');
}

/** Đặt KEY=value: sửa dòng có sẵn (không quan tâm giá trị cũ), hoặc thêm cuối tệp. Không in value. */
function setKey(text, key, value) {
  const re = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
  return re.test(text) ? text.replace(re, () => `${key}=${value}`) : `${text.replace(/\s*$/, '')}\n${key}=${value}\n`;
}

// ---------------------------------------------------------------- nhập ẩn
let queuedLines = null; // chế độ không phải TTY (đọc từ ống dẫn): lấy từng dòng
function readAllStdin() {
  try {
    return readFileSync(0, 'utf8').split(/\r?\n/);
  } catch {
    return [];
  }
}

function askHidden(prompt) {
  if (!process.stdin.isTTY) {
    queuedLines ??= readAllStdin();
    process.stdout.write(`${prompt}\n`);
    return Promise.resolve((queuedLines.shift() ?? '').trim());
  }
  return new Promise((done) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buf = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          return done(buf.trim());
        }
        if (ch === '\u0003') {
          stdin.setRawMode(false);
          process.stdout.write('\nĐã hủy, chưa ghi gì.\n');
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') buf = buf.slice(0, -1);
        else if (ch >= ' ') buf += ch; // dán nhiều ký tự một lúc cũng được; không in gì ra màn hình
      }
    };
    stdin.on('data', onData);
  });
}

// ---------------------------------------------------------------- chương trình
assertSafeTarget();
const current = existsSync(TARGET) ? readFileSync(TARGET, 'utf8') : '';
const currentMap = parseEnv(current);

if (argv.includes('--kiem-tra')) {
  console.log(`Tệp đích: ${TARGET} ${existsSync(TARGET) ? '' : '(chưa có)'}`);
  for (const k of KEYS) console.log(`  ${k.env}: ${currentMap.get(k.env) ? 'đã đặt' : 'chưa đặt'}`);
  process.exit(0);
}

console.log(`
Tạo khóa AI cá nhân cho Gateway.
Tệp sẽ ghi (${insideRepo(TARGET) ? 'trong repo nhưng đã được .gitignore bỏ qua' : 'NGOÀI repo'}, không bị commit): ${TARGET}
Bố cục repo: ${NEW_LAYOUT ? 'mới (01-nen-tang/...)' : 'cũ (apps/...)'} — Gateway: ${relative(ROOT, GATEWAY_DIR)}

• Bạn có thể bỏ qua tất cả (nhấn Enter) — app vẫn chạy ở chế độ giả lập, trả lời mẫu.
• Khóa gõ/dán vào sẽ KHÔNG hiện lên màn hình. Mỗi bạn dùng khóa riêng của mình, đừng chia sẻ.
• Muốn giữ khóa cũ trong tệp: nhấn Enter ở mục đó.
`);

const entered = {};
for (const k of KEYS) {
  const had = currentMap.get(k.env);
  console.log(`— ${k.ten} —`);
  console.log(`  Tạo khóa tại: ${k.trang}`);
  console.log(`  Lưu ý: ${k.luu}`);
  const v = await askHidden(`  Dán khóa ${k.env} ${had ? '(đã có trong tệp — Enter để giữ)' : '(Enter để bỏ qua)'}: `);
  if (v) {
    if (/\s/.test(v) || v.length < 20) {
      console.log('  ⚠ Khóa trông không đúng (quá ngắn hoặc có khoảng trắng) — bỏ qua mục này. Chạy lại script nếu muốn nhập lại.\n');
      continue;
    }
    entered[k.env] = v;
    console.log(`  ✔ đã nhận (${v.length} ký tự)\n`);
  } else {
    console.log(had ? '  ↷ giữ nguyên khóa hiện có\n' : '  ↷ bỏ qua\n');
  }
}

let text = stripManagedBlock(current);
for (const [k, v] of Object.entries(entered)) text = setKey(text, k, v);

const have = Object.fromEntries(KEYS.map((k) => [k.env, Boolean(entered[k.env] || currentMap.get(k.env))]));
const outside = parseEnv(text); // không còn khối tự sinh
const chainLines = buildChains(have).filter((l) => !outside.has(l.split('=')[0]));
if (chainLines.length) {
  text = `${text.replace(/\s*$/, '')}\n\n${BEGIN}\n# Thứ tự thử nguồn AI (nguồn nhanh trước). Mục thiếu khóa bị Gateway bỏ qua.\n${chainLines.join('\n')}\n${END}\n`;
}
if (!text.trim()) {
  console.log('Không có khóa nào được nhập và tệp chưa tồn tại — không ghi gì. App sẽ chạy ở chế độ giả lập.');
  process.exit(0);
}

mkdirSync(dirname(TARGET), { recursive: true });
writeFileSync(TARGET, text.endsWith('\n') ? text : `${text}\n`, { encoding: 'utf8' });
try {
  chmodSync(TARGET, 0o600); // macOS/Linux: chỉ chủ sở hữu đọc; trên Windows lệnh này gần như không có tác dụng (không sao)
} catch {
  /* bỏ qua */
}

const now = parseEnv(readFileSync(TARGET, 'utf8'));
console.log(`Đã ghi: ${TARGET}`);
for (const k of KEYS) console.log(`  ${k.env}: ${now.get(k.env) ? 'đã đặt' : 'chưa đặt'}`);
for (const l of chainLines) console.log(`  ${l.split('=')[0]}: ${l.split('=')[1]}`);
console.log('\nKhởi động lại Gateway để nhận cấu hình mới. Kiểm tra: mở http://localhost:4000/healthz (xem docs/nhom/CAI-DAT.md, mục "Thêm khóa AI").');
