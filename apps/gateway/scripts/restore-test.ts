/**
 * THỬ KHÔI PHỤC một bản backup vào DB TẠM rồi kiểm tra — docs/van-hanh/BACKUP.md (“backup chưa thử khôi phục = chưa có backup”).
 *   RESTORE_DATABASE_URL=postgres://.../becutit_restore_test pnpm --filter @vietlearning/gateway db:restore-test -- --file <tệp.dump>
 * - RESTORE_DATABASE_URL: DB TRỐNG, tạo sẵn, KHÁC DB chính (script từ chối nếu trùng host+cổng+tên với DATABASE_URL).
 * - Kiểm tra: số migration đã áp = số migration trong apps/gateway/drizzle/meta/_journal.json; các bảng chính có mặt; in số dòng.
 * - Xong thì XÓA DB tạm (chứa dữ liệu cá nhân thật).
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { assertSafeRestoreTarget, pgConnectionEnv, pgRestoreArgs, redactUrl, run } from '../src/services/backup/backup.js';
import 'dotenv/config';

const here = dirname(fileURLToPath(import.meta.url));
const TABLES = ['users', 'refresh_tokens', 'srs_cards', 'xp_events', 'daily_activity', 'learner_progress', 'friendships', 'audit_events'];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const file = arg('file');
  if (!file) throw new Error('Thiếu --file <tệp .dump>');
  const target = process.env.RESTORE_DATABASE_URL;
  assertSafeRestoreTarget(target, process.env.DATABASE_URL);
  const env = pgConnectionEnv(target!);
  console.log(`Khôi phục ${file} => ${redactUrl(target!)}`);
  const started = Date.now();
  await run(process.env.PG_RESTORE ?? 'pg_restore', pgRestoreArgs(file, env.PGDATABASE), { ...env });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  const journal = JSON.parse(await readFile(join(here, '..', 'drizzle', 'meta', '_journal.json'), 'utf8')) as { entries: unknown[] };
  const sql = postgres(target!, { max: 1, onnotice: () => {} });
  try {
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from drizzle.__drizzle_migrations`;
    const problems: string[] = [];
    if (n !== journal.entries.length) problems.push(`migration: DB có ${n}, mã nguồn có ${journal.entries.length}`);
    for (const t of TABLES) {
      const [{ exists }] = await sql<{ exists: boolean }[]>`select to_regclass(${'public.' + t}) is not null as exists`;
      if (!exists) {
        problems.push(`thiếu bảng ${t}`);
        continue;
      }
      const [{ c }] = await sql<{ c: number }[]>`select count(*)::int as c from ${sql(t)}`;
      console.log(`  ${t.padEnd(18)} ${c} dòng`);
    }
    if (problems.length) throw new Error(`Khôi phục KHÔNG đạt:\n  ${problems.join('\n  ')}`);
    console.log(`ĐẠT: khôi phục ${seconds} s, ${n} migration. Ghi kết quả vào sổ thử khôi phục (BACKUP.md) rồi xóa DB tạm.`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
