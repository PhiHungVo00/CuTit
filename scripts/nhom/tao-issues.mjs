#!/usr/bin/env node
// Tạo GitHub Issues từ docs/nhom/issues/issues.csv bằng `gh issue create`.
//
// MẶC ĐỊNH LÀ CHẾ ĐỘ KHÔ: chỉ in ra những Issue SẼ được tạo, không gọi `gh`, không đụng mạng.
// Chỉ tạo thật khi có ĐỦ ba cờ: --tao-that  --repo <chủ/tên>  --xac-nhan
//
// Ví dụ:
//   node scripts/nhom/tao-issues.mjs                          # chế độ khô, in tất cả
//   node scripts/nhom/tao-issues.mjs --thu-muc 02             # chế độ khô, chỉ thư mục 02
//   node scripts/nhom/tao-issues.mjs --tao-that --repo <chủ>/<tên> --xac-nhan --thu-muc 02
//
// Không gán người (chưa có tên GitHub của các bạn): sau khi tạo, gán tay trên GitHub.
// Không dùng thư viện ngoài. Cần `gh` đã đăng nhập (chỉ khi tạo thật).
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(HERE, '..', '..', 'docs', 'nhom', 'issues', 'issues.csv');

/** Đọc CSV có ngoặc kép, cho phép xuống dòng và dấu phẩy trong ô; bỏ BOM nếu có. */
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [head, ...data] = rows;
  return data.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

export function parseArgs(argv) {
  const a = { taoThat: false, xacNhan: false, repo: '', thuMuc: '' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--tao-that') a.taoThat = true;
    else if (k === '--xac-nhan') a.xacNhan = true;
    else if (k === '--repo') a.repo = argv[++i] ?? '';
    else if (k === '--thu-muc') a.thuMuc = argv[++i] ?? '';
    else if (k === '--help' || k === '-h') a.help = true;
    else throw new Error(`Cờ lạ: ${k}`);
  }
  return a;
}

function gh(args, input) {
  const r = spawnSync('gh', args, { encoding: 'utf8', input });
  if (r.error) throw r.error;
  return r;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Xem chú thích ở đầu tệp. Mặc định là chế độ khô (không tạo gì).');
    return;
  }
  let issues = parseCsv(readFileSync(CSV_PATH, 'utf8'));
  if (args.thuMuc) issues = issues.filter((x) => x.thu_muc === args.thuMuc);
  const that = args.taoThat;
  if (that && (!args.repo || !args.xacNhan)) {
    console.error('Từ chối: tạo thật cần đủ --tao-that --repo <chủ/tên> --xac-nhan. Chưa tạo Issue nào.');
    process.exit(2);
  }
  if (!that && (args.repo || args.xacNhan)) {
    console.error('Ghi chú: thiếu --tao-that nên vẫn là chế độ khô; --repo/--xac-nhan bị bỏ qua.');
  }

  console.log(that ? `TẠO THẬT ${issues.length} Issue vào ${args.repo}` : `CHẾ ĐỘ KHÔ: ${issues.length} Issue (không tạo gì, không gọi gh)`);
  console.log('-'.repeat(60));

  if (!that) {
    for (const x of issues) {
      console.log(`[${x.thu_muc}] ${x.tieu_de}`);
      console.log(`    nhãn: ${x.nhan}`);
    }
    const nhan = new Set(issues.flatMap((x) => x.nhan.split(',')));
    console.log('-'.repeat(60));
    console.log(`Sẽ tạo ${issues.length} Issue, dùng ${nhan.size} nhãn: ${[...nhan].sort().join(', ')}`);
    console.log('Để tạo thật: thêm --tao-that --repo <chủ/tên> --xac-nhan (cần gh đã đăng nhập).');
    return;
  }

  // Tạo thật: bỏ qua Issue đã có cùng tiêu đề (chạy lại không tạo trùng), tạo nhãn còn thiếu.
  const existing = gh(['issue', 'list', '--repo', args.repo, '--state', 'all', '--limit', '500', '--json', 'title']);
  if (existing.status !== 0) { console.error(existing.stderr); process.exit(1); }
  const have = new Set(JSON.parse(existing.stdout).map((x) => x.title));
  const nhan = new Set(issues.flatMap((x) => x.nhan.split(',')));
  for (const l of nhan) gh(['label', 'create', l, '--repo', args.repo, '--force']);
  let made = 0, skipped = 0;
  for (const x of issues) {
    if (have.has(x.tieu_de)) { skipped++; console.log(`bỏ qua (đã có): ${x.tieu_de}`); continue; }
    const r = gh(['issue', 'create', '--repo', args.repo, '--title', x.tieu_de, '--body-file', '-', '--label', x.nhan], x.noi_dung);
    if (r.status !== 0) { console.error(`LỖI: ${x.tieu_de}\n${r.stderr}`); process.exit(1); }
    made++; console.log(r.stdout.trim());
  }
  console.log(`Xong: tạo ${made}, bỏ qua ${skipped}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
