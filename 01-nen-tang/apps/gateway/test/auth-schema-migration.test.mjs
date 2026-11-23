import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

/**
 * Migration đăng nhập (dự án 3): chạy được từ DB trống VÀ từ DB đang ở 0007 có dữ liệu khách,
 * không mất dữ liệu; ràng buộc unique/check/cascade đúng ở mức DB (không chỉ dựa vào Zod).
 */
const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url));
const LAST_RELEASED = 7; // 0007_ai_global_usage — bản trước dự án 3

/** Bản sao thư mục migration chỉ tới 0007 (giả lập DB production hiện tại) */
function releasedFolder() {
  // Chép tay từng tệp: fs.cpSync làm Node thoát im lặng (mã 127) trên Windows ở máy dev.
  const dir = mkdtempSync(join(tmpdir(), 'mig-0007-'));
  mkdirSync(join(dir, 'meta'));
  const journal = JSON.parse(readFileSync(join(MIGRATIONS, 'meta', '_journal.json'), 'utf8'));
  journal.entries = journal.entries.filter((e) => e.idx <= LAST_RELEASED);
  for (const e of journal.entries) copyFileSync(join(MIGRATIONS, `${e.tag}.sql`), join(dir, `${e.tag}.sql`));
  writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify(journal));
  return dir;
}

const fails = async (client, sql, params, re) => {
  await assert.rejects(client.query(sql, params), re ?? /violates|duplicate/i, sql);
};

test('Migration: nâng từ 0007 có dữ liệu khách — không mất dữ liệu, cột mới có giá trị đúng', async () => {
  const old = releasedFolder();
  const client = new PGlite('memory://');
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: old });
    // Có bảng mới chưa? (chưa — đúng là DB cũ)
    const before = await client.query(`select to_regclass('public.identities') as t`);
    assert.equal(before.rows[0].t, null, 'DB giả lập phải ở bản 0007');

    // Dữ liệu cũ bằng SQL thô (schema Drizzle mới có cột chưa tồn tại)
    const { rows: [u] } = await client.query(`insert into users (recovery_code_hash) values ('rc-hash-1') returning id`);
    await client.query(
      `insert into refresh_tokens (user_id, token_hash, expires_at) values ($1, 'rt-1', now() + interval '90 days'), ($1, 'rt-2', now() + interval '90 days')`,
      [u.id]
    );
    await client.query(`insert into deleted_accounts (credential_hash) values ('old-rt-hash'), ('old-rc-hash')`);
    await client.query(`insert into xp_events (user_id, client_event_id, source, amount, day) values ($1, gen_random_uuid(), 'lesson', 10, '2026-11-20')`, [u.id]);
    await client.query(`insert into srs_cards (user_id, item_ref, front, back, source, due_at) values ($1, 'x:1', 'ngô', 'bắp', 'dialect', now())`, [u.id]);

    await migrate(db, { migrationsFolder: MIGRATIONS });

    const { rows: users } = await client.query(`select id, is_guest, recovery_code_hash, delete_at from users`);
    assert.equal(users.length, 1);
    assert.equal(users[0].recovery_code_hash, 'rc-hash-1', 'mã khôi phục của khách giữ nguyên');
    assert.equal(users[0].is_guest, true);
    assert.equal(users[0].delete_at, null);

    const { rows: rts } = await client.query(`select token_hash, family_id, last_used_at from refresh_tokens order by token_hash`);
    assert.equal(rts.length, 2);
    assert.ok(rts[0].family_id && rts[1].family_id, 'family_id có giá trị');
    assert.notEqual(rts[0].family_id, rts[1].family_id, 'mỗi token cũ là một họ riêng');
    assert.equal(rts[0].last_used_at, null);

    const { rows: tomb } = await client.query(`select credential_hash, reason, expires_at from deleted_accounts order by credential_hash`);
    assert.deepEqual(
      tomb.map((t) => [t.credential_hash, t.reason, t.expires_at]),
      [
        ['old-rc-hash', 'deleted', null],
        ['old-rt-hash', 'deleted', null]
      ],
      'bia mộ cũ: lý do deleted, giữ mãi (không phân biệt được hash mã khôi phục với refresh token)'
    );
    assert.equal((await client.query(`select count(*)::int as n from xp_events`)).rows[0].n, 1);
    assert.equal((await client.query(`select count(*)::int as n from srs_cards`)).rows[0].n, 1);
  } finally {
    await client.close();
    rmSync(old, { recursive: true, force: true });
  }
});

test('Migration: DB trống — unique/check/cascade của bảng đăng nhập', async () => {
  const client = new PGlite('memory://');
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });
    const { rows: [a] } = await client.query(`insert into users default values returning id`);
    const { rows: [b] } = await client.query(`insert into users default values returning id`);

    // identities: (provider, subject) duy nhất
    await client.query(`insert into identities (user_id, provider, subject) values ($1, 'password', 'mai.le')`, [a.id]);
    await fails(client, `insert into identities (user_id, provider, subject) values ($1, 'password', 'mai.le')`, [b.id]);
    // tên đăng nhập phải lưu chữ thường => 'Mai.Le' không lách được unique
    await fails(client, `insert into identities (user_id, provider, subject) values ($1, 'password', 'Mai.Le')`, [b.id], /violates check/i);
    await fails(client, `insert into identities (user_id, provider, subject) values ($1, 'email', 'Mai@Gmail.com')`, [b.id], /violates check/i);
    // Google sub phân biệt hoa thường (không ép chữ thường)
    await client.query(`insert into identities (user_id, provider, subject) values ($1, 'google', 'AbC123')`, [b.id]);
    // một người dùng chỉ một danh tính mỗi provider (hai máy cùng nâng cấp một khách => một danh tính)
    await fails(client, `insert into identities (user_id, provider, subject) values ($1, 'google', 'other-sub')`, [b.id]);
    // provider lạ bị chặn
    await fails(client, `insert into identities (user_id, provider, subject) values ($1, 'facebook', 'x')`, [a.id], /violates check/i);

    // reserved_usernames chữ thường
    await client.query(`insert into reserved_usernames (username, until) values ('cu.tit', now() + interval '30 days')`);
    await fails(client, `insert into reserved_usernames (username, until) values ('Cu.Tit', now())`, [], /violates check/i);

    // password_credentials: một dòng mỗi user
    await client.query(`insert into password_credentials (user_id, password_hash) values ($1, '$argon2id$x')`, [a.id]);
    await fails(client, `insert into password_credentials (user_id, password_hash) values ($1, '$argon2id$y')`, [a.id]);

    // auth_challenges: nonce/ticket/rate_counter duy nhất theo (kind, key_hash); OTP email thì không
    await client.query(`insert into auth_challenges (kind, key_hash, expires_at) values ('oidc_nonce', 'k1', now() + interval '10 minutes')`);
    await fails(client, `insert into auth_challenges (kind, key_hash, expires_at) values ('oidc_nonce', 'k1', now())`, []);
    await client.query(`insert into auth_challenges (kind, key_hash, subject, expires_at) values ('email_otp', 'same', 'hmac-a', now()), ('email_otp', 'same', 'hmac-c', now())`);
    await client.query(`insert into auth_challenges (kind, key_hash, subject, user_id, expires_at) values ('merge_ticket', 't1', $2, $1, now())`, [b.id, a.id]);
    await fails(client, `insert into auth_challenges (kind, key_hash, expires_at) values ('weird', 'k9', now())`, [], /violates check/i);
    // rate_counter: tăng nguyên tử bằng ON CONFLICT trên index một phần (đúng câu lệnh Task 2 sẽ dùng)
    const bump = `insert into auth_challenges (kind, key_hash, attempts, expires_at) values ('rate_counter', 'login:pair:x', 1, now() + interval '15 minutes')
      on conflict (kind, key_hash) where kind <> 'email_otp' do update set attempts = auth_challenges.attempts + 1 returning attempts`;
    assert.equal((await client.query(bump)).rows[0].attempts, 1);
    assert.equal((await client.query(bump)).rows[0].attempts, 2);

    // deleted_accounts: lý do hợp lệ
    await client.query(`insert into deleted_accounts (credential_hash, reason) values ('h-merged', 'merged')`);
    await fails(client, `insert into deleted_accounts (credential_hash, reason) values ('h-x', 'whatever')`, [], /violates check/i);

    // xóa user => cascade sạch bảng mới
    await client.query(`delete from users where id = $1`, [a.id]);
    await client.query(`delete from users where id = $1`, [b.id]);
    for (const t of ['identities', 'password_credentials']) {
      assert.equal((await client.query(`select count(*)::int as n from ${t}`)).rows[0].n, 0, t);
    }
    const { rows: ch } = await client.query(`select kind from auth_challenges where user_id is not null`);
    assert.equal(ch.length, 0, 'thử thách gắn user bị xóa theo');
  } finally {
    await client.close();
  }
});
