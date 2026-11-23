import test from 'node:test';
import assert from 'node:assert/strict';
import { DisplayNameSchema, FriendGoalRequestSchema, InviteCodeSchema, formatInviteCode } from '../dist/api/index.js';

test('Tên hiển thị: chấp nhận chữ có dấu, chuẩn hóa khoảng trắng; từ chối quá ngắn/dài, link, emoji', () => {
  assert.equal(DisplayNameSchema.parse('  Lan   Anh  '), 'Lan Anh');
  assert.equal(DisplayNameSchema.parse('Nguyễn Văn Ánh'), 'Nguyễn Văn Ánh');
  assert.equal(DisplayNameSchema.parse("Jo O'Neil-2"), "Jo O'Neil-2");
  for (const bad of ['a', ' ', 'x'.repeat(25), 'http://x.co', 'bob@mail', 'Lan 😀', '<b>hi</b>', '-ab', 'a\u0000b']) {
    assert.equal(DisplayNameSchema.safeParse(bad).success, false, bad);
  }
});

test('Mã mời: 8 ký tự Crockford, nhập thường/có gạch/khoảng trắng đều được', () => {
  assert.equal(InviteCodeSchema.parse(' abcd-efgh '), 'ABCDEFGH');
  assert.equal(InviteCodeSchema.parse('abcd efgo'), 'ABCDEFG0');
  assert.equal(formatInviteCode('ABCDEFGH'), 'ABCD-EFGH');
  for (const bad of ['ABC', 'ABCDEFGHJ', 'ABCD-EFG!', 'ABCDEFGU']) assert.equal(InviteCodeSchema.safeParse(bad).success, false, bad);
});

test('Mục tiêu tuần chỉ nhận 30/60/90/120 phút', () => {
  assert.equal(FriendGoalRequestSchema.safeParse({ goalMinutes: 60 }).success, true);
  assert.equal(FriendGoalRequestSchema.safeParse({ goalMinutes: 45 }).success, false);
});
