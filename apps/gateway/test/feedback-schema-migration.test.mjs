import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import postgres from 'postgres';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { migrate as migratePg } from 'drizzle-orm/postgres-js/migrator';

/**
 * Migration dự án 5a (góp ý + quản trị): bảng mới, ràng buộc ở mức DB, cascade/set null, nhật ký chỉ-thêm (trigger),
 * hàm admin_audit_purge, chạy từ DB trống VÀ từ DB đang ở 0008 có dữ liệu, chạy lại không vỡ.
 * Mặc định PGlite; đặt TEST_DATABASE_URL (vd. postgres://postgres:postgres@localhost:55433/postgres) để chạy trên
 * Postgres thật — mỗi test tự tạo một DATABASE riêng rồi xóa.
 */
const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url));
const LAST_RELEASED = 8; // 0008_auth_identities — bản trước dự án 5a
const PG_URL = process.env.TEST_DATABASE_URL;

/** Mở một DB trống + hàm migrate(folder); trả {query, migrate, close} dùng chung cho PGlite/Postgres */
async function openDb() {
  if (!PG_URL) {
    const client = new PGlite('memory://');
    const db = drizzlePglite(client);
    return {
      query: (sql, params) => client.query(sql, params),
      migrate: (folder) => migratePglite(db, { migrationsFolder: folder }),
      close: () => client.close()
    };
  }
  const name = `t5a_${randomBytes(6).toString('hex')}`;
  const admin = postgres(PG_URL, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database ${name}`);
  const url = new URL(PG_URL);
  url.pathname = `/${name}`;
  const conn = postgres(url.toString(), { max: 1, onnotice: () => {} });
  const db = drizzlePg(conn);
  return {
    query: async (sql, params) => ({ rows: await conn.unsafe(sql, params ?? []) }),
    migrate: (folder) => migratePg(db, { migrationsFolder: folder }),
    close: async () => {
      await conn.end();
      await admin.unsafe(`drop database ${name} with (force)`);
      await admin.end();
    }
  };
}

/** Bản sao thư mục migration chỉ tới 0008 (giả lập DB production hiện tại) */
function releasedFolder() {
  const dir = mkdtempSync(join(tmpdir(), 'mig-0008-'));
  mkdirSync(join(dir, 'meta'));
  const journal = JSON.parse(readFileSync(join(MIGRATIONS, 'meta', '_journal.json'), 'utf8'));
  journal.entries = journal.entries.filter((e) => e.idx <= LAST_RELEASED);
  for (const e of journal.entries) copyFileSync(join(MIGRATIONS, `${e.tag}.sql`), join(dir, `${e.tag}.sql`));
  writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify(journal));
  return dir;
}

const fails = async (db, sql, params, re) => {
  await assert.rejects(db.query(sql, params), re ?? /violates|duplicate|unique/i, sql);
};
const count = async (db, sql, params) => (await db.query(`select count(*)::int as n from ${sql}`, params)).rows[0].n;

const CTX = JSON.stringify({ appVersion: '0.9.0', build: 'abc', platform: 'android', osVersion: '15', locale: 'vi', route: '/p', recentRoutes: [] });
const BODY = 'Nội dung góp ý đủ dài';
async function newUser(db) {
  return (await db.query(`insert into users default values returning id`)).rows[0].id;
}
async function newReport(db, userId, over = '') {
  return (await db.query(`insert into feedback_reports (user_id, kind, body, context${over ? ', ' + over.split('|')[0] : ''}) values ($1, 'bug', '${BODY}', '${CTX}'::jsonb${over ? ', ' + over.split('|')[1] : ''}) returning id`, [userId])).rows[0].id;
}

test('Migration 5a: nâng từ 0008 có dữ liệu — không mất dữ liệu cũ, tạo đủ 8 bảng mới', async () => {
  const old = releasedFolder();
  const db = await openDb();
  try {
    await db.migrate(old);
    assert.equal((await db.query(`select to_regclass('public.feedback_reports') as t`)).rows[0].t, null, 'DB giả lập phải ở bản 0008');
    const u = await newUser(db);
    await db.query(`insert into identities (user_id, provider, subject) values ($1, 'password', 'chu.app')`, [u]);
    await db.query(`insert into audit_events (type, outcome, user_id) values ('login', 'success', $1)`, [u]);

    await db.migrate(MIGRATIONS);

    for (const t of ['feedback_reports', 'feedback_files', 'feedback_events', 'blob_deletions', 'staff_roles', 'staff_totp', 'admin_sessions', 'admin_audit_log']) {
      assert.notEqual((await db.query(`select to_regclass('public.${t}') as t`)).rows[0].t, null, `thiếu bảng ${t}`);
    }
    assert.equal(await count(db, 'users'), 1);
    assert.equal(await count(db, 'identities'), 1);
    assert.equal(await count(db, 'audit_events'), 1);

    // chạy lại không vỡ (đã áp rồi => không làm gì)
    await db.migrate(MIGRATIONS);
    assert.equal(await count(db, 'users'), 1);
  } finally {
    await db.close();
    rmSync(old, { recursive: true, force: true });
  }
});

test('Migration 5a: ràng buộc góp ý (kind/status/độ dài/done_at/loại tệp/cỡ tệp/sự kiện)', async () => {
  const db = await openDb();
  try {
    await db.migrate(MIGRATIONS);
    const u = await newUser(db);
    const fb = await newReport(db, u);
    const row = (await db.query(`select status, user_unread, done_at from feedback_reports where id = $1`, [fb])).rows[0];
    assert.deepEqual([row.status, row.user_unread, row.done_at], ['received', false, null]);

    // kind / status / độ dài body
    await fails(db, `insert into feedback_reports (user_id, kind, body, context) values ($1, 'spam', '${BODY}', '{}')`, [u], /violates check/i);
    await fails(db, `insert into feedback_reports (user_id, kind, body, context) values ($1, 'bug', 'ngắn quá', '{}')`, [u], /violates check/i);
    await fails(db, `insert into feedback_reports (user_id, kind, body, context) values ($1, 'bug', repeat('a', 2001), '{}')`, [u], /violates check/i);
    await fails(db, `insert into feedback_reports (user_id, kind, body, context, status) values ($1, 'bug', '${BODY}', '{}', 'closed')`, [u], /violates check/i);
    // done_at luôn khớp status: 'done' phải có done_at, trạng thái khác thì done_at phải NULL
    await fails(db, `update feedback_reports set status = 'done' where id = $1`, [fb], /violates check/i);
    await fails(db, `update feedback_reports set done_at = now() where id = $1`, [fb], /violates check/i);
    await db.query(`update feedback_reports set status = 'done', done_at = now() where id = $1`, [fb]);
    await fails(db, `update feedback_reports set status = 'in_progress' where id = $1`, [fb], /violates check/i);
    await db.query(`update feedback_reports set status = 'in_progress', done_at = null where id = $1`, [fb]);
    // user_id bắt buộc + phải tồn tại
    await fails(db, `insert into feedback_reports (user_id, kind, body, context) values (gen_random_uuid(), 'bug', '${BODY}', '{}')`, [], /foreign key/i);

    // tệp: loại khớp media, SVG/exe không lọt, cỡ theo loại, blob_key duy nhất
    const file = (media, type, bytes, key, dur = 'null') =>
      db.query(`insert into feedback_files (feedback_id, blob_key, media, content_type, bytes, duration_ms) values ($1, $2, '${media}', '${type}', ${bytes}, ${dur})`, [fb, key]);
    await file('image', 'image/png', 1000, `feedback/${fb}/a.png`);
    await file('image', 'image/webp', 5242880, `feedback/${fb}/b.webp`);
    await file('video', 'video/mp4', 52428800, `feedback/${fb}/c.mp4`, '60000');
    await fails(db, `insert into feedback_files (feedback_id, blob_key, media, content_type, bytes) values ($1, 'k1', 'image', 'image/svg+xml', 10)`, [fb], /violates check/i);
    await fails(db, `insert into feedback_files (feedback_id, blob_key, media, content_type, bytes) values ($1, 'k2', 'video', 'application/x-msdownload', 10)`, [fb], /violates check/i);
    await fails(db, `insert into feedback_files (feedback_id, blob_key, media, content_type, bytes) values ($1, 'k3', 'image', 'video/mp4', 10)`, [fb], /violates check/i);
    await fails(db, `insert into feedback_files (feedback_id, blob_key, media, content_type, bytes) values ($1, 'k4', 'image', 'image/png', 5242881)`, [fb], /violates check/i);
    await fails(db, `insert into feedback_files (feedback_id, blob_key, media, content_type, bytes) values ($1, 'k5', 'video', 'video/mp4', 52428801)`, [fb], /violates check/i);
    await fails(db, `insert into feedback_files (feedback_id, blob_key, media, content_type, bytes) values ($1, 'k6', 'image', 'image/png', 0)`, [fb], /violates check/i);
    await fails(db, `insert into feedback_files (feedback_id, blob_key, media, content_type, bytes, duration_ms) values ($1, 'k7', 'video', 'video/mp4', 10, 60001)`, [fb], /violates check/i);
    await fails(db, `insert into feedback_files (feedback_id, blob_key, media, content_type, bytes) values ($1, 'feedback/${fb}/a.png', 'image', 'image/png', 10)`, [fb], /duplicate|unique/i);

    // sự kiện: phải có trạng thái hoặc lời nhắn; lời nhắn ≤ 1000
    await db.query(`insert into feedback_events (feedback_id, status) values ($1, 'in_progress')`, [fb]);
    await db.query(`insert into feedback_events (feedback_id, message) values ($1, 'Cảm ơn bạn')`, [fb]);
    await fails(db, `insert into feedback_events (feedback_id) values ($1)`, [fb], /violates check/i);
    await fails(db, `insert into feedback_events (feedback_id, message) values ($1, repeat('a', 1001))`, [fb], /violates check/i);
    await fails(db, `insert into feedback_events (feedback_id, status) values ($1, 'closed')`, [fb], /violates check/i);

    // hàng dọn tệp
    await db.query(`insert into blob_deletions (blob_key, reason) values ('feedback/x/y.png', 'user_deleted')`);
    assert.equal((await db.query(`select attempts from blob_deletions`)).rows[0].attempts, 0);
    await fails(db, `insert into blob_deletions (blob_key, reason) values ('feedback/x/y.png', 'again')`, [], /duplicate|unique/i);
    await fails(db, `update blob_deletions set attempts = -1`, [], /violates check/i);
  } finally {
    await db.close();
  }
});

test('Migration 5a: ràng buộc quản trị (vai trò, TOTP, phiên, nhật ký)', async () => {
  const db = await openDb();
  try {
    await db.migrate(MIGRATIONS);
    const u = await newUser(db);

    await db.query(`insert into staff_roles (user_id, role) values ($1, 'owner')`, [u]);
    await fails(db, `insert into staff_roles (user_id, role) values ($1, 'owner')`, [u], /duplicate|unique/i);
    await fails(db, `insert into staff_roles (user_id, role) values ($1, 'god')`, [u], /violates check/i);
    await db.query(`insert into staff_roles (user_id, role) values ($1, 'support')`, [u]); // nhiều vai trò khác nhau được

    await db.query(`insert into staff_totp (user_id, secret_enc) values ($1, $2)`, [u, Buffer.from('nonce-tag-cipher')]);
    const t = (await db.query(`select last_used_step, backup_hashes, confirmed_at from staff_totp`)).rows[0];
    assert.equal(Number(t.last_used_step), 0);
    assert.deepEqual([...t.backup_hashes], []);
    assert.equal(t.confirmed_at, null);
    await db.query(`update staff_totp set backup_hashes = array(select 'h' || g from generate_series(1, 10) g)`);
    await fails(db, `update staff_totp set backup_hashes = array(select 'h' || g from generate_series(1, 11) g)`, [], /violates check/i);
    // last_used_step là bigint: một bước TOTP hiện nay (~5.9e7) và giá trị lớn đều vừa
    await db.query(`update staff_totp set last_used_step = 59000000000`);
    await fails(db, `insert into staff_totp (user_id, secret_enc) values ($1, $2)`, [u, Buffer.from('x')], /duplicate|unique/i);

    await db.query(`insert into admin_sessions (user_id, refresh_hash, mfa_at, expires_at) values ($1, 'rh1', now(), now() + interval '12 hours')`, [u]);
    await fails(db, `insert into admin_sessions (user_id, refresh_hash, mfa_at, expires_at) values ($1, 'rh1', now(), now())`, [u], /duplicate|unique/i);

    // nhật ký: actor_kind hợp lệ; CLI thì không có actor_user_id
    await db.query(`insert into admin_audit_log (actor_user_id, actor_kind, action, target_type, target_id, meta) values ($1, 'user', 'auth.login', 'session', 's1', '{"ok":true}')`, [u]);
    await db.query(`insert into admin_audit_log (actor_kind, action, target_type) values ('cli', 'role.grant', 'user')`);
    await db.query(`insert into admin_audit_log (actor_kind, action, target_type) values ('user', 'auth.failed', 'user')`); // đăng nhập sai: chưa biết người
    await fails(db, `insert into admin_audit_log (actor_user_id, actor_kind, action, target_type) values ($1, 'cli', 'role.grant', 'user')`, [u], /violates check/i);
    await fails(db, `insert into admin_audit_log (actor_kind, action, target_type) values ('robot', 'x', 'y')`, [], /violates check/i);
    const ids = (await db.query(`select id from admin_audit_log order by id`)).rows.map((r) => Number(r.id));
    assert.deepEqual(ids, [1, 2, 3].map((n) => ids[0] + n - 1), 'id tăng dần (bigserial)');
  } finally {
    await db.close();
  }
});

test('Migration 5a: xóa tài khoản — người dùng cascade, nhân viên cascade, nhật ký GIỮ, actor/granted_by SET NULL', async () => {
  const db = await openDb();
  try {
    await db.migrate(MIGRATIONS);
    const user = await newUser(db);
    const staff = await newUser(db);
    const owner = await newUser(db);
    const fb = await newReport(db, user);
    await db.query(`insert into feedback_files (feedback_id, blob_key, media, content_type, bytes) values ($1, 'feedback/a/b.png', 'image', 'image/png', 10)`, [fb]);
    await db.query(`insert into feedback_events (feedback_id, actor_user_id, message) values ($1, $2, 'đã nhận')`, [fb, staff]);
    await db.query(`insert into staff_roles (user_id, role, granted_by) values ($1, 'owner', $2)`, [staff, owner]);
    await db.query(`insert into staff_totp (user_id, secret_enc) values ($1, $2)`, [staff, Buffer.from('s')]);
    await db.query(`insert into admin_sessions (user_id, refresh_hash, mfa_at, expires_at) values ($1, 'rh', now(), now() + interval '1 hour')`, [staff]);
    await db.query(`insert into admin_audit_log (actor_user_id, actor_kind, action, target_type) values ($1, 'user', 'feedback.status', 'feedback')`, [staff]);

    // nhân viên bị xóa: vai trò/TOTP/phiên cascade; sự kiện góp ý giữ lại nhưng bỏ liên kết; nhật ký giữ nguyên
    await db.query(`delete from users where id = $1`, [staff]);
    assert.equal(await count(db, 'staff_roles'), 0);
    assert.equal(await count(db, 'staff_totp'), 0);
    assert.equal(await count(db, 'admin_sessions'), 0);
    assert.equal(await count(db, 'feedback_events'), 1);
    assert.equal((await db.query(`select actor_user_id from feedback_events`)).rows[0].actor_user_id, null);
    assert.equal(await count(db, 'admin_audit_log'), 1, 'nhật ký quản trị giữ khi xóa tài khoản');
    assert.equal((await db.query(`select actor_user_id from admin_audit_log`)).rows[0].actor_user_id, staff, 'nhật ký không có FK');

    // người cấp quyền bị xóa: granted_by SET NULL, vai trò của người được cấp còn
    const other = await newUser(db);
    await db.query(`insert into staff_roles (user_id, role, granted_by) values ($1, 'editor', $2)`, [other, owner]);
    await db.query(`delete from users where id = $1`, [owner]);
    assert.equal((await db.query(`select granted_by from staff_roles where user_id = $1`, [other])).rows[0].granted_by, null);

    // người dùng bị xóa cứng: góp ý + tệp + sự kiện xóa theo (khóa tệp mất => purgeUserFeedbackBlobs phải đọc TRƯỚC)
    await db.query(`delete from users where id = $1`, [user]);
    for (const t of ['feedback_reports', 'feedback_files', 'feedback_events']) assert.equal(await count(db, t), 0, t);
  } finally {
    await db.close();
  }
});

test('Nhật ký quản trị chỉ-thêm: UPDATE/DELETE/TRUNCATE bị chặn; admin_audit_purge xóa theo mốc và trigger vẫn bật', async () => {
  const db = await openDb();
  try {
    await db.migrate(MIGRATIONS);
    await db.query(`insert into admin_audit_log (actor_kind, action, target_type, created_at) values
      ('cli', 'role.grant', 'user', now() - interval '800 days'),
      ('cli', 'role.revoke', 'user', now() - interval '731 days'),
      ('cli', 'totp.reset', 'user', now() - interval '10 days')`);

    await fails(db, `update admin_audit_log set action = 'auth.login'`, [], /append-only|chỉ thêm|not allowed|không được/i);
    await fails(db, `delete from admin_audit_log`, [], /append-only|chỉ thêm|not allowed|không được/i);
    await fails(db, `delete from admin_audit_log where id = (select min(id) from admin_audit_log)`, [], /append-only|chỉ thêm|not allowed|không được/i);
    await fails(db, `truncate admin_audit_log`, [], /append-only|chỉ thêm|not allowed|không được/i);
    assert.equal(await count(db, 'admin_audit_log'), 3, 'chưa mất dòng nào');

    // purge theo mốc 2 năm (730 ngày): chỉ 2 dòng cũ hơn mốc bị xóa
    const r = await db.query(`select admin_audit_purge(now() - interval '730 days') as n`);
    assert.equal(Number(r.rows[0].n), 2);
    assert.equal(await count(db, 'admin_audit_log'), 1);
    assert.equal((await db.query(`select action from admin_audit_log`)).rows[0].action, 'totp.reset');

    // sau purge trigger vẫn bật (không bị bỏ ngỏ)
    await fails(db, `update admin_audit_log set action = 'auth.login'`, [], /append-only|chỉ thêm|not allowed|không được/i);
    await fails(db, `delete from admin_audit_log`, [], /append-only|chỉ thêm|not allowed|không được/i);
    const tg = await db.query(`select tgenabled from pg_trigger where tgrelid = 'admin_audit_log'::regclass and not tgisinternal order by tgname`);
    assert.ok(tg.rows.length >= 1);
    for (const t of tg.rows) assert.equal(t.tgenabled, 'O', 'trigger ở trạng thái bật');

    // gọi purge thứ hai (không còn gì để xóa) không lỗi
    assert.equal(Number((await db.query(`select admin_audit_purge(now() - interval '730 days') as n`)).rows[0].n), 0);
    // purge nhận mốc hôm nay xóa hết rồi vẫn thêm được dòng mới
    assert.equal(Number((await db.query(`select admin_audit_purge(now() + interval '1 day') as n`)).rows[0].n), 1);
    await db.query(`insert into admin_audit_log (actor_kind, action, target_type) values ('cli', 'role.grant', 'user')`);
    assert.equal(await count(db, 'admin_audit_log'), 1);
  } finally {
    await db.close();
  }
});

test('Index cần cho truy vấn chính có mặt (hàng chờ, "của tôi", chấm đỏ, dọn tệp)', async () => {
  const db = await openDb();
  try {
    await db.migrate(MIGRATIONS);
    const { rows } = await db.query(`select indexname from pg_indexes where schemaname = 'public' and tablename in ('feedback_reports','feedback_files','feedback_events','admin_sessions','admin_audit_log')`);
    const names = rows.map((r) => r.indexname);
    for (const n of [
      'feedback_reports_status_created_idx',
      'feedback_reports_user_created_idx',
      'feedback_reports_user_unread_idx',
      'feedback_reports_done_at_idx',
      'feedback_files_feedback_idx',
      'feedback_files_blob_key_uq',
      'feedback_events_feedback_idx',
      'admin_sessions_user_idx',
      'admin_sessions_expires_idx',
      'admin_audit_log_created_idx'
    ]) {
      assert.ok(names.includes(n), `thiếu index ${n}`);
    }
  } finally {
    await db.close();
  }
});
