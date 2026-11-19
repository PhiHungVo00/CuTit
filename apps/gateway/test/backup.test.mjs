import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertSafeRestoreTarget,
  backupFileName,
  expiredBackups,
  pgConnectionEnv,
  pgDumpArgs,
  pgRestoreArgs,
  redactUrl
} from '../dist/services/backup/backup.js';

/** Kế hoạch backup (docs/van-hanh/BACKUP.md): phần thuần của script pg_dump / thử khôi phục. */
const URL_A = 'postgres://app:s3cr%40t@db.example.com:5433/becutit?sslmode=require';

test('pgConnectionEnv: tách URL thành biến PG* (mật khẩu KHÔNG nằm trong argv), giải mã %xx', () => {
  const env = pgConnectionEnv(URL_A);
  assert.deepEqual(env, { PGHOST: 'db.example.com', PGPORT: '5433', PGUSER: 'app', PGPASSWORD: 's3cr@t', PGDATABASE: 'becutit', PGSSLMODE: 'require' });
  assert.equal(pgConnectionEnv('postgresql://u@localhost/x').PGPORT, '5432');
  assert.equal(pgConnectionEnv('postgresql://u@localhost/x').PGSSLMODE, undefined);
  assert.throws(() => pgConnectionEnv('mysql://u@h/x'), /postgres/);
  assert.throws(() => pgConnectionEnv('postgres://u@h/'), /tên database/);
});

test('pgDumpArgs / pgRestoreArgs: định dạng custom, không owner/quyền, không chứa URL hay mật khẩu', () => {
  const dump = pgDumpArgs('/b/x.dump');
  assert.deepEqual(dump, ['--format=custom', '--no-owner', '--no-privileges', '--compress=6', '--file', '/b/x.dump']);
  const restore = pgRestoreArgs('/b/x.dump', 'restore_test');
  assert.ok(restore.includes('--exit-on-error') && restore.includes('--no-owner'));
  assert.deepEqual(restore.slice(-3), ['--dbname', 'restore_test', '/b/x.dump']);
  for (const a of [...dump, ...restore]) assert.ok(!a.includes('s3cr') && !a.includes('://'));
});

test('redactUrl: ẩn mật khẩu khi in log', () => {
  assert.equal(redactUrl(URL_A), 'postgres://app:***@db.example.com:5433/becutit?sslmode=require');
  assert.equal(redactUrl('khong phai url'), '<url không hợp lệ>');
});

test('backupFileName: theo giờ UTC, sắp xếp được theo tên', () => {
  assert.equal(backupFileName(new Date('2026-11-19T02:03:04.567Z')), 'becutit-20261119T020304Z.dump');
});

test('assertSafeRestoreTarget: bắt buộc DB đích riêng, từ chối khôi phục đè lên DB chính', () => {
  assert.throws(() => assertSafeRestoreTarget(undefined, URL_A), /RESTORE_DATABASE_URL/);
  assert.throws(() => assertSafeRestoreTarget(URL_A, URL_A), /DB chính/);
  // cùng host/cổng/tên DB, khác user/mật khẩu/tham số => vẫn là DB chính
  assert.throws(() => assertSafeRestoreTarget('postgres://other:pw@DB.example.com:5433/becutit', URL_A), /DB chính/);
  assert.doesNotThrow(() => assertSafeRestoreTarget('postgres://app:pw@db.example.com:5433/becutit_restore_test', URL_A));
  assert.doesNotThrow(() => assertSafeRestoreTarget('postgres://app:pw@localhost:5432/restore', undefined));
});

test('expiredBackups: chỉ chọn tệp backup quá hạn giữ, luôn giữ tối thiểu N bản mới nhất', () => {
  const now = new Date('2026-11-19T00:00:00Z');
  const files = [
    'becutit-20260901T000000Z.dump',
    'becutit-20261001T000000Z.dump',
    'becutit-20261018T000000Z.dump',
    'becutit-20261118T000000Z.dump',
    'ghi-chu.txt',
    'becutit-20260901T000000Z.dump.sha256'
  ];
  assert.deepEqual(expiredBackups(files, now, 30, 1), ['becutit-20260901T000000Z.dump', 'becutit-20261001T000000Z.dump', 'becutit-20261018T000000Z.dump']);
  assert.deepEqual(expiredBackups(files, now, 30, 3), ['becutit-20260901T000000Z.dump']);
  assert.deepEqual(expiredBackups(['becutit-20200101T000000Z.dump'], now, 30, 1), [], 'bản duy nhất không bao giờ bị xóa');
});
