import { spawn } from 'node:child_process';

/**
 * Phần thuần (test được) của backup Postgres — docs/van-hanh/BACKUP.md.
 * Script: 01-nen-tang/apps/gateway/scripts/backup-db.ts (pg_dump) và scripts/restore-test.ts (thử khôi phục vào DB tạm).
 *
 * Nguyên tắc: URL/mật khẩu KHÔNG bao giờ nằm trong argv (lộ qua `ps`) hay log — truyền qua biến môi trường PG*.
 */

export interface PgEnv {
  PGHOST: string;
  PGPORT: string;
  PGUSER: string;
  PGPASSWORD?: string;
  PGDATABASE: string;
  PGSSLMODE?: string;
}

function parsePgUrl(url: string): URL {
  const u = new URL(url);
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') throw new Error('Chỉ hỗ trợ URL postgres:// hoặc postgresql://');
  if (!decodeURIComponent(u.pathname.replace(/^\//, ''))) throw new Error('URL thiếu tên database');
  return u;
}

/** DATABASE_URL => biến môi trường libpq cho pg_dump/pg_restore */
export function pgConnectionEnv(url: string): PgEnv {
  const u = parsePgUrl(url);
  const env: PgEnv = {
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: u.password ? decodeURIComponent(u.password) : undefined,
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, '')),
    PGSSLMODE: u.searchParams.get('sslmode') ?? undefined
  };
  return Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)) as unknown as PgEnv;
}

/** Neon: host pooled có hậu tố `-pooler` (PgBouncer chế độ transaction) — pg_dump cần kết nối trực tiếp */
export function isPooledHost(url: string): boolean {
  return /-pooler(\.|$)/i.test(parsePgUrl(url).hostname);
}

/** In log an toàn */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '<url không hợp lệ>';
  }
}

/** Định dạng custom (-Fc): nén, khôi phục chọn lọc được bằng pg_restore */
export function pgDumpArgs(outFile: string): string[] {
  return ['--format=custom', '--no-owner', '--no-privileges', '--compress=6', '--file', outFile];
}

/** Khôi phục vào DB đích (đã tạo sẵn, trống). Host/user/mật khẩu qua PG*; dừng ở lỗi đầu tiên. */
export function pgRestoreArgs(file: string, dbName: string): string[] {
  return ['--no-owner', '--no-privileges', '--exit-on-error', '--single-transaction', '--dbname', dbName, file];
}

/** becutit-YYYYMMDDTHHMMSSZ.dump (UTC) — sắp xếp theo tên = theo thời gian */
export function backupFileName(now = new Date()): string {
  return `becutit-${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}.dump`;
}

const NAME_RE = /^becutit-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.dump$/;

/**
 * Tệp backup cục bộ quá hạn giữ (`keepDays`), nhưng luôn giữ `keepMin` bản mới nhất
 * (backup hỏng nhiều ngày liền vẫn còn bản cũ để khôi phục).
 */
export function expiredBackups(files: string[], now: Date, keepDays: number, keepMin = 7): string[] {
  const dated = files
    .map((f) => {
      const m = NAME_RE.exec(f);
      return m ? { f, t: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) } : null;
    })
    .filter((x): x is { f: string; t: number } => x !== null)
    .sort((a, b) => b.t - a.t);
  const cutoff = now.getTime() - keepDays * 24 * 3600 * 1000;
  return dated
    .slice(keepMin)
    .filter((x) => x.t < cutoff)
    .map((x) => x.f)
    .sort();
}

/** Chặn thử khôi phục đè lên DB chính (cùng host + cổng + tên DB, bất kể user/mật khẩu) */
export function assertSafeRestoreTarget(target: string | undefined, primary: string | undefined): void {
  if (!target) throw new Error('Thiếu RESTORE_DATABASE_URL (DB tạm, trống, KHÁC DB chính)');
  const t = pgConnectionEnv(target);
  if (!primary) return;
  const p = pgConnectionEnv(primary);
  const same = t.PGHOST.toLowerCase() === p.PGHOST.toLowerCase() && t.PGPORT === p.PGPORT && t.PGDATABASE === p.PGDATABASE;
  if (same) throw new Error('RESTORE_DATABASE_URL trỏ vào DB chính — từ chối khôi phục đè dữ liệu thật');
}

/** Chạy lệnh KHÔNG qua shell; env bổ sung (PG*) chỉ cho tiến trình con. */
export function run(cmd: string, args: string[], env: Record<string, string | undefined>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { shell: false, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, ...env } });
    child.on('error', (err) => reject(new Error(`Không chạy được ${cmd}: ${err.message} (đã cài PostgreSQL client chưa?)`)));
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} thoát với mã ${code}`))));
  });
}
