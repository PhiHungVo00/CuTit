import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AuthRecoverRequestSchema,
  SyncEventSchema,
  SyncRequestSchema,
  formatRecoveryCode,
  normalizeRecoveryCode
} from '../dist/api/index.js';

const id = () => crypto.randomUUID();
const at = '2026-11-17T08:00:00.000Z';

test('Mã khôi phục: chuẩn hóa chữ thường, gạch, khoảng trắng, O/I/L dễ nhầm', () => {
  assert.equal(normalizeRecoveryCode(' abcd-efgh ijkm-np01 '), 'ABCDEFGH1JKMNP01');
  assert.equal(formatRecoveryCode('abcdefghjkmnpqrs'), 'ABCD-EFGH-JKMN-PQRS');
  assert.equal(AuthRecoverRequestSchema.parse({ recoveryCode: 'abcd efgh jkmn pq0o' }).recoveryCode, 'ABCDEFGHJKMNPQ00');
  assert.equal(AuthRecoverRequestSchema.safeParse({ recoveryCode: 'ABCD-EFGH-JKMN-PQU1' }).success, false, 'U không thuộc bảng chữ');
  assert.equal(AuthRecoverRequestSchema.safeParse({ recoveryCode: 'ABCD' }).success, false);
});

test('Sự kiện đồng bộ: nhận đúng loại, từ chối loại lạ / XP 0 / lô quá 200', () => {
  assert.equal(SyncEventSchema.safeParse({ clientEventId: id(), at, type: 'xp.add', source: 'lesson', amount: 10, day: '2026-11-17' }).success, true);
  assert.equal(SyncEventSchema.safeParse({ clientEventId: id(), at, type: 'xp.add', source: 'lesson', amount: 0, day: '2026-11-17' }).success, false);
  assert.equal(SyncEventSchema.safeParse({ clientEventId: id(), at, type: 'hack' }).success, false);
  assert.equal(SyncEventSchema.safeParse({ clientEventId: 'không-phải-uuid', at, type: 'achievement.earn', key: 'first' }).success, false);
  assert.equal(SyncEventSchema.safeParse({ clientEventId: id(), at, type: 'activity.set', day: '17/11/2026', seconds: 5 }).success, false, 'ngày sai dạng');
  const ev = { clientEventId: id(), at, type: 'achievement.earn', key: 'first' };
  assert.equal(SyncRequestSchema.safeParse({ events: Array(200).fill(ev) }).success, true);
  assert.equal(SyncRequestSchema.safeParse({ events: Array(201).fill(ev) }).success, false);
});
