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
import { InMemoryBus } from '../dist/services/realtime/RealtimeBus.js';

/**
 * Migration dự án 4 (bạn bè: chat, nhóm, gọi): bảng mới + cột thêm, chỉ mục/ràng buộc có thật, ON DELETE đúng từng bảng,
 * chạy từ DB trống VÀ từ DB đang ở 0011 có dữ liệu. Mặc định PGlite; đặt TEST_DATABASE_URL để chạy trên Postgres thật
 * (mỗi test tự tạo một DATABASE riêng rồi xóa) — xem feedback-schema-migration.test.mjs.
 */
const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url));
const LAST_RELEASED = 11; // 0011_staff_invite_session_rotation — bản trước dự án 4
const PG_URL = process.env.TEST_DATABASE_URL;

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
  const name = `t4_${randomBytes(6).toString('hex')}`;
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

/** Bản sao thư mục migration chỉ tới 0011 (giả lập DB production hiện tại) */
function releasedFolder() {
  const dir = mkdtempSync(join(tmpdir(), 'mig-0011-'));
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
const exists = async (db, t) => (await db.query(`select to_regclass('public.${t}') as t`)).rows[0].t !== null;

const NEW_TABLES = [
  'friend_requests', 'user_blocks', 'conversations', 'conversation_members', 'chat_messages',
  'chat_attachments', 'chat_reports', 'chat_restrictions', 'push_tokens', 'calls', 'call_participants'
];

async function newUser(db) {
  return (await db.query(`insert into users default values returning id`)).rows[0].id;
}
async function newGroup(db, owner, title = 'Nhóm học') {
  const c = (await db.query(`insert into conversations (kind, title, created_by) values ('group', $1, $2) returning id`, [title, owner])).rows[0].id;
  await db.query(`insert into conversation_members (conversation_id, user_id, role) values ($1, $2, 'owner')`, [c, owner]);
  return c;
}
async function newMsg(db, cid, seq, sender, extra = '') {
  return (await db.query(`insert into chat_messages (conversation_id, seq, sender_id, client_msg_id, kind, body) values ($1, $2, $3, gen_random_uuid(), 'text', 'xin chào'${extra}) returning id`, [cid, seq, sender])).rows[0].id;
}

test('Migration 4: nâng từ 0011 có dữ liệu — không mất dữ liệu cũ, tạo đủ bảng mới, bảng AI chat cũ nguyên vẹn', async () => {
  const old = releasedFolder();
  const db = await openDb();
  try {
    await db.migrate(old);
    for (const t of NEW_TABLES) assert.equal(await exists(db, t), false, `${t} chưa được có ở 0011`);
    const u = await newUser(db);
    await db.query(`insert into social_profiles (user_id, display_name) values ($1, 'An')`, [u]);
    const u2 = await newUser(db);
    await db.query(`insert into friendships (user_a, user_b) values ($1, $2)`, [u < u2 ? u : u2, u < u2 ? u2 : u]);
    const s = (await db.query(`insert into sessions (user_id) values ($1) returning id`, [u])).rows[0].id;
    await db.query(`insert into messages (session_id, role, text) values ($1, 'user', 'chat AI cũ')`, [s]);
    await db.query(`insert into audit_events (type, outcome, user_id) values ('login', 'success', $1)`, [u]);

    await db.migrate(MIGRATIONS);

    for (const t of NEW_TABLES) assert.equal(await exists(db, t), true, `thiếu bảng ${t}`);
    assert.equal(await count(db, 'users'), 2);
    assert.equal(await count(db, 'messages'), 1, 'bảng chat AI `messages` không bị đụng');
    assert.equal(await count(db, 'sessions'), 1, 'bảng chat AI `sessions` không bị đụng');
    assert.equal(await count(db, 'audit_events'), 1);
    // cột mới có mặc định đúng cho dòng cũ
    const sp = (await db.query(`select handle, handle_changed_at, discoverable, show_online, show_read_receipts, show_push_preview from social_profiles`)).rows[0];
    assert.deepEqual([sp.handle, sp.handle_changed_at, sp.discoverable, sp.show_online, sp.show_read_receipts, sp.show_push_preview], [null, null, true, true, true, false]);
    assert.equal((await db.query(`select quest_active from friendships`)).rows[0].quest_active, true);
    const us = (await db.query(`select is_adult, age_declared_at from users limit 1`)).rows[0];
    assert.deepEqual([us.is_adult, us.age_declared_at], [null, null]);

    // chạy lại không vỡ
    await db.migrate(MIGRATIONS);
    assert.equal(await count(db, 'users'), 2);
  } finally {
    await db.close();
    rmSync(old, { recursive: true, force: true });
  }
});

test('Migration 4: DB trống — tên bảng mới không đụng bảng cũ; KHÔNG có cột năm/ngày sinh ở bất kỳ bảng nào', async () => {
  const db = await openDb();
  try {
    await db.migrate(MIGRATIONS);
    for (const t of NEW_TABLES) assert.equal(await exists(db, t), true, t);
    const cols = (await db.query(`select table_name, column_name from information_schema.columns where table_schema = 'public'`)).rows;
    const bad = cols.filter((c) => /birth|dob|year_of|age_year|ngay_sinh|nam_sinh/i.test(c.column_name));
    assert.deepEqual(bad, [], 'không được có cột lưu năm/ngày sinh');
    const ageCols = cols.filter((c) => c.table_name === 'users' && /adult|age/i.test(c.column_name)).map((c) => c.column_name).sort();
    assert.deepEqual(ageCols, ['age_declared_at', 'is_adult']);
    // chỉ mục có thật
    const idx = (await db.query(`select indexname from pg_indexes where schemaname = 'public'`)).rows.map((r) => r.indexname);
    for (const i of [
      'social_profiles_handle_lower_uq', 'friend_requests_pending_uq', 'friend_requests_to_idx', 'chat_messages_conv_seq_uq',
      'chat_messages_dedupe_uq', 'chat_messages_conv_seq_desc_idx', 'conversation_members_user_idx', 'chat_restrictions_active_idx',
      'chat_reports_status_idx', 'chat_attachments_blob_key_uq', 'chat_messages_attachment_uq', 'call_participants_active_idx', 'calls_open_idx'
    ]) assert.ok(idx.includes(i), `thiếu chỉ mục ${i}`);
    const def = (await db.query(`select indexdef from pg_indexes where indexname = 'social_profiles_handle_lower_uq'`)).rows[0].indexdef;
    assert.match(def, /lower\(/i);
  } finally {
    await db.close();
  }
});

test('Migration 4: cờ tuổi (is_adult/age_declared_at luôn đi cùng nhau)', async () => {
  const db = await openDb();
  try {
    await db.migrate(MIGRATIONS);
    const u = await newUser(db);
    await fails(db, `update users set is_adult = true where id = $1`, [u], /violates check/i);
    await fails(db, `update users set age_declared_at = now() where id = $1`, [u], /violates check/i);
    await db.query(`update users set is_adult = false, age_declared_at = now() where id = $1`, [u]);
    await db.query(`update users set is_adult = true, age_declared_at = now() where id = $1`, [u]);
  } finally {
    await db.close();
  }
});

test('Migration 4: handle — duy nhất không phân biệt hoa thường, đúng định dạng, nhiều người chưa đặt handle', async () => {
  const db = await openDb();
  try {
    await db.migrate(MIGRATIONS);
    const [a, b, c, d] = [await newUser(db), await newUser(db), await newUser(db), await newUser(db)];
    for (const u of [a, b, c, d]) await db.query(`insert into social_profiles (user_id, display_name) values ($1, 'X')`, [u]);
    // a, b, c chưa đặt: NULL không đụng nhau
    await db.query(`update social_profiles set handle = 'Anh' where user_id = $1`, [a]);
    await fails(db, `update social_profiles set handle = 'anh' where user_id = $1`, [b], /duplicate|unique/i);
    await fails(db, `update social_profiles set handle = 'ANH' where user_id = $1`, [b], /duplicate|unique/i);
    await db.query(`update social_profiles set handle = 'anh.2' where user_id = $1`, [b]);
    // định dạng
    for (const h of ['ab', 'a..b', '.abc', 'abc.', 'a b c', 'ánh', 'a-b-c', 'x'.repeat(25)]) {
      await fails(db, `update social_profiles set handle = $2 where user_id = $1`, [c, h], /violates check/i);
    }
    await db.query(`update social_profiles set handle = $2 where user_id = $1`, [c, 'x'.repeat(24)]);
    assert.equal((await db.query(`select discoverable from social_profiles where user_id = $1`, [d])).rows[0].discoverable, true);
  } finally {
    await db.close();
  }
});

test('Migration 4: lời mời kết bạn và chặn', async () => {
  const db = await openDb();
  try {
    await db.migrate(MIGRATIONS);
    const [a, b] = [await newUser(db), await newUser(db)];
    const r = (await db.query(`insert into friend_requests (from_user_id, to_user_id) values ($1, $2) returning id, status, resolved_at`, [a, b])).rows[0];
    assert.deepEqual([r.status, r.resolved_at], ['pending', null]);
    // trùng (from,to) đang pending bị chặn; chiều ngược lại thì được
    await fails(db, `insert into friend_requests (from_user_id, to_user_id) values ($1, $2)`, [a, b], /duplicate|unique/i);
    await db.query(`insert into friend_requests (from_user_id, to_user_id) values ($1, $2)`, [b, a]);
    // đã xử lý thì gửi lại được; pending ⇔ resolved_at null
    await fails(db, `update friend_requests set status = 'declined' where id = $1`, [r.id], /violates check/i);
    await db.query(`update friend_requests set status = 'declined', resolved_at = now() where id = $1`, [r.id]);
    await db.query(`insert into friend_requests (from_user_id, to_user_id) values ($1, $2)`, [a, b]);
    await fails(db, `update friend_requests set resolved_at = now() where status = 'pending' and from_user_id = $1`, [a], /violates check/i);
    await fails(db, `insert into friend_requests (from_user_id, to_user_id, status, resolved_at) values ($1, $2, 'blocked', now())`, [a, b], /violates check/i);
    await fails(db, `insert into friend_requests (from_user_id, to_user_id) values ($1, $1)`, [a], /violates check/i);
    await fails(db, `insert into friend_requests (from_user_id, to_user_id) values (gen_random_uuid(), $1)`, [a], /foreign key/i);

    await db.query(`insert into user_blocks (blocker_id, blocked_id) values ($1, $2)`, [a, b]);
    await fails(db, `insert into user_blocks (blocker_id, blocked_id) values ($1, $2)`, [a, b], /duplicate|unique/i);
    await db.query(`insert into user_blocks (blocker_id, blocked_id) values ($1, $2)`, [b, a]);
    await fails(db, `insert into user_blocks (blocker_id, blocked_id) values ($1, $1)`, [a], /violates check/i);
  } finally {
    await db.close();
  }
});

test('Migration 4: cuộc trò chuyện, thành viên, tin — seq, chống trùng, nội dung theo loại', async () => {
  const db = await openDb();
  try {
    await db.migrate(MIGRATIONS);
    const [a, b] = [await newUser(db), await newUser(db)];
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const dm = (await db.query(`insert into conversations (kind, dm_key) values ('dm', $1) returning id, last_seq`, [key])).rows[0];
    assert.equal(Number(dm.last_seq), 0);
    await fails(db, `insert into conversations (kind, dm_key) values ('dm', $1)`, [key], /duplicate|unique/i); // mỗi cặp một cuộc 1-1
    await fails(db, `insert into conversations (kind) values ('dm')`, [], /violates check/i); // dm cần dm_key
    await fails(db, `insert into conversations (kind, dm_key, title) values ('dm', 'k', 'x')`, [], /violates check/i);
    await fails(db, `insert into conversations (kind, title) values ('group', null)`, [], /violates check/i);
    await fails(db, `insert into conversations (kind, title) values ('group', '')`, [], /violates check/i);
    await fails(db, `insert into conversations (kind, title) values ('group', repeat('a', 61))`, [], /violates check/i);
    await fails(db, `insert into conversations (kind, title, dm_key) values ('group', 'ok', 'k2')`, [], /violates check/i);
    await fails(db, `insert into conversations (kind, title) values ('channel', 'x')`, [], /violates check/i);
    await db.query(`insert into conversations (kind, title) values ('group', $1)`, ['a'.repeat(60)]);

    const cid = await newGroup(db, a);
    await db.query(`insert into conversation_members (conversation_id, user_id) values ($1, $2)`, [cid, b]);
    const mem = (await db.query(`select role, joined_seq, last_read_seq, hidden_before_seq, left_at from conversation_members where user_id = $1`, [b])).rows[0];
    assert.deepEqual([mem.role, Number(mem.joined_seq), Number(mem.last_read_seq), Number(mem.hidden_before_seq), mem.left_at], ['member', 0, 0, 0, null]);
    await fails(db, `insert into conversation_members (conversation_id, user_id) values ($1, $2)`, [cid, b], /duplicate|unique/i);
    await fails(db, `insert into conversation_members (conversation_id, user_id, role) values ($1, gen_random_uuid(), 'member')`, [cid], /foreign key/i);
    await fails(db, `update conversation_members set role = 'boss' where user_id = $1`, [b], /violates check/i);
    await fails(db, `update conversation_members set last_read_seq = -1 where user_id = $1`, [b], /violates check/i);

    // seq: duy nhất trong cuộc trò chuyện, ≥ 1
    const cm = '11111111-1111-4111-8111-111111111111';
    await db.query(`insert into chat_messages (conversation_id, seq, sender_id, client_msg_id, kind, body) values ($1, 1, $2, $3, 'text', 'a')`, [cid, a, cm]);
    await fails(db, `insert into chat_messages (conversation_id, seq, sender_id, client_msg_id, kind, body) values ($1, 1, $2, gen_random_uuid(), 'text', 'b')`, [cid, b], /duplicate|unique/i);
    await fails(db, `insert into chat_messages (conversation_id, seq, sender_id, client_msg_id, kind, body) values ($1, 0, $2, gen_random_uuid(), 'text', 'b')`, [cid, b], /violates check/i);
    // chống trùng (conversation_id, sender_id, client_msg_id): cùng clientMsgId, seq mới => vẫn bị chặn
    await fails(db, `insert into chat_messages (conversation_id, seq, sender_id, client_msg_id, kind, body) values ($1, 2, $2, $3, 'text', 'a')`, [cid, a, cm], /duplicate|unique/i);
    // người KHÁC dùng cùng clientMsgId thì được (khóa theo người gửi)
    await db.query(`insert into chat_messages (conversation_id, seq, sender_id, client_msg_id, kind, body) values ($1, 2, $2, $3, 'text', 'b')`, [cid, b, cm]);
    // body ≤ 4000, kind hợp lệ
    await fails(db, `insert into chat_messages (conversation_id, seq, sender_id, kind, body) values ($1, 3, $2, 'text', repeat('a', 4001))`, [cid, a], /violates check/i);
    await db.query(`insert into chat_messages (conversation_id, seq, sender_id, kind, body) values ($1, 3, $2, 'text', repeat('a', 4000))`, [cid, a]);
    await fails(db, `insert into chat_messages (conversation_id, seq, sender_id, kind, body) values ($1, 4, $2, 'gif', 'x')`, [cid, a], /violates check/i);
    // nội dung theo loại: ảnh phải có tệp, chữ không được có tệp, hệ thống phải có system_event và không có body
    await fails(db, `insert into chat_messages (conversation_id, seq, sender_id, kind) values ($1, 4, $2, 'image')`, [cid, a], /violates check/i);
    await fails(db, `insert into chat_messages (conversation_id, seq, kind, body) values ($1, 4, 'system', 'chữ')`, [cid], /violates check/i);
    await fails(db, `insert into chat_messages (conversation_id, seq, kind) values ($1, 4, 'system')`, [cid], /violates check/i);
    await db.query(`insert into chat_messages (conversation_id, seq, kind, system_event) values ($1, 4, 'system', '{"type":"member_left"}')`, [cid]);
    // xóa mềm: deleted_at ⇔ deleted_kind
    await fails(db, `update chat_messages set deleted_at = now() where seq = 1 and conversation_id = $1`, [cid], /violates check/i);
    await fails(db, `update chat_messages set deleted_at = now(), deleted_kind = 'oops' where seq = 1 and conversation_id = $1`, [cid], /violates check/i);
    await db.query(`update chat_messages set deleted_at = now(), deleted_kind = 'recalled' where seq = 1 and conversation_id = $1`, [cid]);
  } finally {
    await db.close();
  }
});

test('Migration 4: tệp đính kèm (loại/cỡ/độ dài), gắn tệp một lần, báo cáo, khóa chat, push token, cuộc gọi', async () => {
  const db = await openDb();
  try {
    await db.migrate(MIGRATIONS);
    const [a, b] = [await newUser(db), await newUser(db)];
    const cid = await newGroup(db, a);
    const att = (media, type, bytes, key, extra = '') =>
      db.query(`insert into chat_attachments (conversation_id, uploader_id, blob_key, media, content_type, bytes${extra ? ', ' + extra.split('|')[0] : ''}) values ($1, $2, $3, '${media}', '${type}', ${bytes}${extra ? ', ' + extra.split('|')[1] : ''}) returning id`, [cid, a, key]);
    const img = (await att('image', 'image/webp', 100_000, `chat/${cid}/a.webp`)).rows[0].id;
    await att('image', 'image/png', 2 * 2 ** 20, `chat/${cid}/b.png`);
    const voice = (await att('voice', 'audio/webm', 3 * 2 ** 20, `chat/${cid}/c.webm`, 'duration_ms|120000')).rows[0].id;
    await fails(db, `insert into chat_attachments (conversation_id, blob_key, media, content_type, bytes) values ($1, 'k1', 'image', 'image/svg+xml', 10)`, [cid], /violates check/i);
    await fails(db, `insert into chat_attachments (conversation_id, blob_key, media, content_type, bytes) values ($1, 'k2', 'image', 'audio/webm', 10)`, [cid], /violates check/i);
    await fails(db, `insert into chat_attachments (conversation_id, blob_key, media, content_type, bytes) values ($1, 'k3', 'image', 'image/png', ${2 * 2 ** 20 + 1})`, [cid], /violates check/i);
    await fails(db, `insert into chat_attachments (conversation_id, blob_key, media, content_type, bytes) values ($1, 'k4', 'voice', 'audio/webm', ${3 * 2 ** 20 + 1})`, [cid], /violates check/i);
    await fails(db, `insert into chat_attachments (conversation_id, blob_key, media, content_type, bytes) values ($1, 'k5', 'image', 'image/png', 0)`, [cid], /violates check/i);
    await fails(db, `insert into chat_attachments (conversation_id, blob_key, media, content_type, bytes, duration_ms) values ($1, 'k6', 'voice', 'audio/webm', 10, 120001)`, [cid], /violates check/i);
    await fails(db, `insert into chat_attachments (conversation_id, blob_key, media, content_type, bytes, width) values ($1, 'k7', 'image', 'image/png', 10, 1281)`, [cid], /violates check/i);
    await fails(db, `insert into chat_attachments (conversation_id, blob_key, media, content_type, bytes, waveform) values ($1, 'k8', 'voice', 'audio/webm', 10, (select jsonb_agg(g) from generate_series(1, 65) g))`, [cid], /violates check/i);
    await fails(db, `insert into chat_attachments (conversation_id, blob_key, media, content_type, bytes) values ($1, 'chat/${cid}/a.webp', 'image', 'image/png', 10)`, [cid], /duplicate|unique/i);

    // gắn tệp vào tin: một tệp một tin
    await db.query(`insert into chat_messages (conversation_id, seq, sender_id, kind, attachment_id) values ($1, 1, $2, 'image', $3)`, [cid, a, img]);
    await fails(db, `insert into chat_messages (conversation_id, seq, sender_id, kind, attachment_id) values ($1, 2, $2, 'image', $3)`, [cid, a, img], /duplicate|unique/i);
    await db.query(`insert into chat_messages (conversation_id, seq, sender_id, kind, attachment_id) values ($1, 2, $2, 'voice', $3)`, [cid, a, voice]);
    const m = await newMsg(db, cid, 3, a);

    // báo cáo
    const rep = (await db.query(`insert into chat_reports (reporter_id, reported_user_id, conversation_id, message_id, reason, snapshot) values ($1, $2, $3, $4, 'spam', '[{"seq":3}]'::jsonb) returning id, status`, [b, a, cid, m])).rows[0];
    assert.equal(rep.status, 'open');
    await fails(db, `insert into chat_reports (reporter_id, reported_user_id, reason) values ($1, $2, 'rude')`, [b, a], /violates check/i);
    await fails(db, `insert into chat_reports (reporter_id, reported_user_id, reason, note) values ($1, $2, 'spam', repeat('a', 501))`, [b, a], /violates check/i);
    await fails(db, `insert into chat_reports (reporter_id, reported_user_id, reason, snapshot) values ($1, $2, 'spam', '{}'::jsonb)`, [b, a], /violates check/i);
    await fails(db, `insert into chat_reports (reporter_id, reported_user_id, reason, snapshot) values ($1, $2, 'spam', (select jsonb_agg(g) from generate_series(1, 31) g))`, [b, a], /violates check/i);
    await fails(db, `insert into chat_reports (reporter_id, reported_user_id, reason) values ($1, $1, 'spam')`, [b], /violates check/i);
    await fails(db, `update chat_reports set status = 'actioned' where id = $1`, [rep.id], /violates check/i);
    await db.query(`update chat_reports set status = 'actioned', resolved_at = now(), action = 'restrict' where id = $1`, [rep.id]);
    await fails(db, `update chat_reports set action = 'ban' where id = $1`, [rep.id], /violates check/i);

    // khóa chat
    await db.query(`insert into chat_restrictions (user_id, reason, report_id) values ($1, 'quấy rối', $2)`, [a, rep.id]);
    await fails(db, `insert into chat_restrictions (user_id, kind, reason) values ($1, 'mute', 'x')`, [a], /violates check/i);
    await fails(db, `insert into chat_restrictions (user_id, reason) values ($1, '')`, [a], /violates check/i);

    // push token
    const tok = 't'.repeat(40);
    await db.query(`insert into push_tokens (user_id, token, platform, app_build, locale) values ($1, $2, 'android', 12, 'vi')`, [a, tok]);
    await fails(db, `insert into push_tokens (user_id, token, platform) values ($1, $2, 'android')`, [b, tok], /duplicate|unique/i);
    await fails(db, `insert into push_tokens (user_id, token, platform) values ($1, $2, 'ios')`, [a, 'u'.repeat(40)], /violates check/i);
    await fails(db, `insert into push_tokens (user_id, token, platform, locale) values ($1, $2, 'android', 'fr')`, [a, 'u'.repeat(40)], /violates check/i);
    await fails(db, `insert into push_tokens (user_id, token, platform) values ($1, 'ngắn', 'android')`, [a], /violates check/i);

    // cuộc gọi
    const call = (await db.query(`insert into calls (conversation_id, kind, initiator_id) values ($1, 'video', $2) returning id, mode`, [cid, a])).rows[0];
    assert.equal(call.mode, 'mesh');
    await fails(db, `insert into calls (conversation_id, kind) values ($1, 'screen')`, [cid], /violates check/i);
    await fails(db, `insert into calls (conversation_id, kind, mode) values ($1, 'voice', 'p2p')`, [cid], /violates check/i);
    await fails(db, `update calls set ended_at = now() where id = $1`, [call.id], /violates check/i);
    await fails(db, `update calls set ended_at = now(), end_reason = 'because' where id = $1`, [call.id], /violates check/i);
    await db.query(`update calls set ended_at = now(), end_reason = 'hangup' where id = $1`, [call.id]);
    await db.query(`insert into call_participants (call_id, user_id) values ($1, $2)`, [call.id, a]);
    await fails(db, `insert into call_participants (call_id, user_id) values ($1, $2)`, [call.id, a], /duplicate|unique/i);
    await fails(db, `update call_participants set relay_seconds = -1`, [], /violates check/i);
    assert.equal((await db.query(`select relay_seconds from call_participants`)).rows[0].relay_seconds, 0);
  } finally {
    await db.close();
  }
});

test('Migration 4: xóa người dùng KHÔNG bị chặn — tin còn lại (sender NULL); thành viên/token/lời mời/chặn/khóa/người gọi cascade', async () => {
  const db = await openDb();
  try {
    await db.migrate(MIGRATIONS);
    const [a, b, c] = [await newUser(db), await newUser(db), await newUser(db)];
    // a xuất hiện ở MỌI cột khóa ngoại tới users của dự án 4
    const cid = await newGroup(db, a);
    await db.query(`insert into conversation_members (conversation_id, user_id) values ($1, $2)`, [cid, b]);
    const att = (await db.query(`insert into chat_attachments (conversation_id, uploader_id, blob_key, media, content_type, bytes) values ($1, $2, $3, 'image', 'image/webp', 100) returning id`, [cid, a, `chat/${cid}/x.webp`])).rows[0].id;
    const mText = await newMsg(db, cid, 1, a);
    await db.query(`insert into chat_messages (conversation_id, seq, sender_id, kind, attachment_id) values ($1, 2, $2, 'image', $3)`, [cid, a, att]);
    await db.query(`insert into friend_requests (from_user_id, to_user_id) values ($1, $2)`, [a, b]);
    await db.query(`insert into friend_requests (from_user_id, to_user_id) values ($1, $2)`, [c, a]);
    await db.query(`insert into user_blocks (blocker_id, blocked_id) values ($1, $2)`, [a, b]);
    await db.query(`insert into user_blocks (blocker_id, blocked_id) values ($1, $2)`, [b, a]);
    await db.query(`insert into push_tokens (user_id, token, platform) values ($1, $2, 'android')`, [a, 't'.repeat(40)]);
    const rep = (await db.query(`insert into chat_reports (reporter_id, reported_user_id, conversation_id, message_id, reason, resolved_by) values ($1, $2, $3, $4, 'scam', $1) returning id`, [a, b, cid, mText])).rows[0].id;
    const rep2 = (await db.query(`insert into chat_reports (reporter_id, reported_user_id, reason) values ($1, $2, 'spam') returning id`, [b, a])).rows[0].id;
    await db.query(`insert into chat_restrictions (user_id, reason, created_by) values ($1, 'x', $1)`, [a]);
    await db.query(`insert into chat_restrictions (user_id, reason, created_by, report_id) values ($1, 'y', $2, $3)`, [b, a, rep]);
    const call = (await db.query(`insert into calls (conversation_id, kind, initiator_id) values ($1, 'voice', $2) returning id`, [cid, a])).rows[0].id;
    await db.query(`insert into call_participants (call_id, user_id) values ($1, $2), ($1, $3)`, [call, a, b]);
    await db.query(`insert into conversations (kind, title, created_by) values ('group', 'Của a', $1)`, [a]);
    await db.query(`update users set is_adult = true, age_declared_at = now() where id = $1`, [a]);

    await db.query(`delete from users where id = $1`, [a]); // không được ném lỗi FK

    // tin còn nguyên, chỉ mất người gửi
    const msgs = (await db.query(`select seq, sender_id from chat_messages where conversation_id = $1 order by seq`, [cid])).rows;
    assert.equal(msgs.length, 2);
    assert.ok(msgs.every((m) => m.sender_id === null));
    // dòng cascade theo người dùng
    assert.equal(await count(db, 'conversation_members', ), 1, 'chỉ còn b');
    assert.equal(await count(db, 'push_tokens'), 0);
    assert.equal(await count(db, 'friend_requests'), 0);
    assert.equal(await count(db, 'user_blocks'), 0);
    assert.equal(await count(db, 'chat_restrictions where user_id = $1', [a]), 0);
    assert.equal(await count(db, 'call_participants'), 1);
    // dòng tham chiếu mềm còn lại, trỏ NULL
    const r = (await db.query(`select reporter_id, resolved_by from chat_reports where id = $1`, [rep])).rows[0];
    assert.deepEqual([r.reporter_id, r.resolved_by], [null, null]);
    assert.equal((await db.query(`select reported_user_id from chat_reports where id = $1`, [rep2])).rows[0].reported_user_id, null);
    assert.equal((await db.query(`select created_by from chat_restrictions where user_id = $1`, [b])).rows[0].created_by, null);
    assert.equal((await db.query(`select initiator_id from calls where id = $1`, [call])).rows[0].initiator_id, null);
    assert.equal((await db.query(`select uploader_id from chat_attachments where id = $1`, [att])).rows[0].uploader_id, null);
    assert.equal((await db.query(`select created_by from conversations where title = 'Của a'`)).rows[0].created_by, null);

    // xóa cuộc trò chuyện kéo theo tin, tệp, cuộc gọi; báo cáo giữ lại (conversation_id / message_id → NULL)
    await db.query(`delete from conversations where id = $1`, [cid]);
    assert.equal(await count(db, 'chat_messages'), 0);
    assert.equal(await count(db, 'chat_attachments'), 0);
    assert.equal(await count(db, 'calls'), 0);
    assert.equal(await count(db, 'chat_reports'), 2);
    const r2 = (await db.query(`select conversation_id, message_id from chat_reports where id = $1`, [rep])).rows[0];
    assert.deepEqual([r2.conversation_id, r2.message_id], [null, null]);
  } finally {
    await db.close();
  }
});

test('Migration 4: tệp đang gắn vào tin không xóa lẻ được (đánh dấu purged_at thay vì xóa); tin xóa-tài-khoản được rỗng; xóa cả cuộc trò chuyện vẫn chạy', async () => {
  const db = await openDb();
  try {
    await db.migrate(MIGRATIONS);
    const a = await newUser(db);
    const cid = await newGroup(db, a);
    const att = (await db.query(`insert into chat_attachments (conversation_id, uploader_id, blob_key, media, content_type, bytes) values ($1, $2, 'chat/k.webp', 'image', 'image/webp', 5) returning id`, [cid, a])).rows[0].id;
    await db.query(`insert into chat_messages (conversation_id, seq, sender_id, kind, attachment_id) values ($1, 1, $2, 'image', $3)`, [cid, a, att]);
    await fails(db, `delete from chat_attachments where id = $1`, [att], /foreign key|violates/i);
    await db.query(`update chat_attachments set purged_at = now() where id = $1`, [att]);
    // gỡ tệp khỏi tin chỉ hợp lệ khi tin được đánh dấu xóa do xóa tài khoản
    await fails(db, `update chat_messages set attachment_id = null where conversation_id = $1`, [cid], /violates check/i);
    await db.query(`update chat_messages set attachment_id = null, deleted_at = now(), deleted_kind = 'account_deleted' where conversation_id = $1`, [cid]);
    await db.query(`delete from chat_attachments where id = $1`, [att]);
    // cascade cả cuộc trò chuyện với tin + tệp đang gắn
    const att2 = (await db.query(`insert into chat_attachments (conversation_id, uploader_id, blob_key, media, content_type, bytes) values ($1, $2, 'chat/k2.webp', 'image', 'image/webp', 5) returning id`, [cid, a])).rows[0].id;
    await db.query(`insert into chat_messages (conversation_id, seq, sender_id, kind, attachment_id) values ($1, 2, $2, 'image', $3)`, [cid, a, att2]);
    await db.query(`delete from conversations where id = $1`, [cid]);
    assert.equal(await count(db, 'chat_messages'), 0);
    assert.equal(await count(db, 'chat_attachments'), 0);
  } finally {
    await db.close();
  }
});

test('RealtimeBus (InMemoryBus): phát cho người nhận không trùng, subscribe/hủy, người nghe lỗi không phá người phát', () => {
  const bus = new InMemoryBus();
  const seen = [];
  const off = bus.subscribe((u, f) => seen.push([u, f.t]));
  bus.subscribe(() => {
    throw new Error('người nghe hỏng');
  });
  const frame = { t: 'ping' };
  bus.publish(['u1', 'u2', 'u1'], frame);
  assert.deepEqual(seen, [[['u1', 'u2'], 'ping']]);
  assert.equal(bus.framesFor('u1').length, 1);
  assert.equal(bus.framesFor('u3').length, 0);
  off();
  bus.publish(['u1'], frame);
  assert.equal(seen.length, 1);
  assert.equal(bus.isOnline('u1'), false);
  bus.setOnline('u1', true, false);
  assert.deepEqual([bus.isOnline('u1'), bus.isForeground('u1')], [true, false]);
  bus.setOnline('u1', true, true);
  assert.equal(bus.isForeground('u1'), true);
  bus.setOnline('u1', false);
  assert.deepEqual([bus.isOnline('u1'), bus.isForeground('u1')], [false, false]);
});
