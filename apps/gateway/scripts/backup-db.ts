/**
 * Backup Postgres bằng pg_dump (định dạng custom) — docs/van-hanh/BACKUP.md.
 *   DATABASE_URL=postgres://... pnpm --filter @vietlearning/gateway db:backup
 * Biến môi trường:
 *   BACKUP_DATABASE_URL | DATABASE_URL_UNPOOLED | DATABASE_URL   (lấy cái đầu tiên có giá trị; Neon: phải là chuỗi
 *                      TRỰC TIẾP, không phải host `-pooler`). Không có (dev PGlite) => báo rồi thoát
 *   BACKUP_DIR         thư mục ghi tệp (mặc định apps/gateway/.data/backups — gitignored)
 *   BACKUP_KEEP_DAYS   số ngày giữ tệp CỤC BỘ (mặc định 30; luôn giữ 7 bản mới nhất)
 * Kết quả: becutit-<UTC>.dump + .sha256. Đẩy tệp sang object storage là bước riêng (cron, xem BACKUP.md),
 * để kho backup nằm NGOÀI máy/nhà cung cấp DB chính.
 * pg_dump phải cùng hoặc mới hơn bản chính (major) của server.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupFileName, expiredBackups, isPooledHost, pgConnectionEnv, pgDumpArgs, redactUrl, run } from '../src/services/backup/backup.js';
import 'dotenv/config';

const here = dirname(fileURLToPath(import.meta.url));

async function sha256File(file: string): Promise<string> {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(file)) h.update(chunk as Buffer);
  return h.digest('hex');
}

async function main() {
  const url = process.env.BACKUP_DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error('Thiếu DATABASE_URL. Dev dùng PGlite (apps/gateway/.data/pglite): sao chép cả thư mục khi Gateway đã tắt.');
    process.exit(2);
  }
  if (isPooledHost(url)) {
    console.error('Chuỗi kết nối là host pooled (-pooler): pg_dump cần kết nối trực tiếp. Đặt BACKUP_DATABASE_URL hoặc DATABASE_URL_UNPOOLED.');
    process.exit(2);
  }
  const dir = process.env.BACKUP_DIR ?? join(here, '..', '.data', 'backups');
  const keepDays = Number(process.env.BACKUP_KEEP_DAYS ?? 30);
  await mkdir(dir, { recursive: true });
  const file = join(dir, backupFileName());
  console.log(`Backup ${redactUrl(url)} => ${file}`);
  const started = Date.now();
  await run(process.env.PG_DUMP ?? 'pg_dump', pgDumpArgs(file), { ...pgConnectionEnv(url) });
  const sum = await sha256File(file);
  await writeFile(`${file}.sha256`, `${sum}  ${basename(file)}\n`);
  const { size } = await stat(file);
  console.log(`Xong sau ${((Date.now() - started) / 1000).toFixed(1)} s: ${(size / 1024).toFixed(0)} KiB, sha256 ${sum}`);

  for (const old of expiredBackups(await readdir(dir), new Date(), keepDays)) {
    await rm(join(dir, old), { force: true });
    await rm(join(dir, `${old}.sha256`), { force: true });
    console.log(`Đã xóa bản cục bộ quá hạn: ${old}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
