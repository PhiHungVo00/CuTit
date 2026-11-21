import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UsernameSchema,
  PasswordSchema,
  EmailSchema,
  OtpCodeSchema,
  AuthErrorCode,
  AuthSignInResponseSchema,
  AuthRegisterRequestSchema,
  AuthRegisterResponseSchema,
  AuthPasswordLoginRequestSchema,
  AuthGoogleRequestSchema,
  AuthNonceResponseSchema,
  AuthMergeRequestSchema,
  AuthLogoutRequestSchema,
  EmailStartRequestSchema,
  EmailVerifyRequestSchema,
  PasswordForgotRequestSchema,
  PasswordResetWithEmailRequestSchema,
  PasswordResetWithBackupRequestSchema,
  BackupCodeResponseSchema,
  PasswordChangeRequestSchema,
  IdentityListResponseSchema,
  DeleteMeRequestSchema,
  DeleteMeResultSchema,
  RestoreAccountRequestSchema,
  RESERVED_USERNAMES
} from '../dist/api/index.js';

const uid = '6f1c1d2e-8a3b-4c5d-9e6f-0a1b2c3d4e5f';
const tokens = { accessToken: 'a'.repeat(20), refreshToken: 'r'.repeat(40), expiresIn: 900, userId: uid };
const ok = (s, v) => s.safeParse(v).success;

test('Tên đăng nhập: chuẩn hóa trim + chữ thường', () => {
  assert.equal(UsernameSchema.parse(' Mai.Le '), 'mai.le');
  assert.equal(UsernameSchema.parse('MAI_LE_99'), 'mai_le_99');
  assert.equal(UsernameSchema.parse('abc'), 'abc', 'đúng 3 ký tự');
  assert.equal(UsernameSchema.parse('a'.repeat(24)), 'a'.repeat(24), 'đúng 24 ký tự');
});

test('Tên đăng nhập: từ chối sai dạng, Unicode, tên cấm', () => {
  for (const bad of ['.mai', 'mai.', 'ma', 'a'.repeat(25), 'mai le', 'mai-le', 'maì', 'MAÌ', 'mai@le', '', '   ']) {
    assert.equal(ok(UsernameSchema, bad), false, JSON.stringify(bad));
  }
  // Ký hiệu Kelvin (U+212A) viết thường thành 'k' ASCII: phải TỪ CHỐI, không được lặng lẽ thành 'kim'
  assert.equal(ok(UsernameSchema, 'Kim'), false, 'không gập Unicode về ASCII');
  for (const name of ['admin', 'Admin', ' CUTIT ', 'becutit', 'support', 'root', 'system', 'moderator']) {
    assert.equal(ok(UsernameSchema, name), false, `tên cấm ${name}`);
  }
  assert.ok(RESERVED_USERNAMES.includes('admin'));
});

test('Mật khẩu: 8–128 ký tự, không trim', () => {
  assert.equal(ok(PasswordSchema, '1234567'), false);
  assert.equal(ok(PasswordSchema, '12345678'), true);
  assert.equal(ok(PasswordSchema, 'x'.repeat(128)), true);
  assert.equal(ok(PasswordSchema, 'x'.repeat(129)), false);
  assert.equal(PasswordSchema.parse('  có dấu  '), '  có dấu  ', 'giữ nguyên khoảng trắng');
});

test('Email + mã OTP 6 số', () => {
  assert.equal(EmailSchema.parse(' Mai@Gmail.COM '), 'mai@gmail.com');
  assert.equal(ok(EmailSchema, 'không-phải-email'), false);
  // ký hiệu Kelvin U+212A viết thường thành 'k' ASCII => phải bị từ chối TRƯỚC khi viết thường (như UsernameSchema)
  assert.equal(ok(EmailSchema, 'Kelvin@gmail.com'), false);
  assert.equal(ok(OtpCodeSchema, '123456'), true);
  for (const bad of ['12345', '1234567', '12345a', ' 123456']) assert.equal(ok(OtpCodeSchema, bad), false, bad);
  assert.equal(ok(EmailVerifyRequestSchema, { email: 'a@b.co', code: '12345' }), false);
  assert.equal(ok(EmailVerifyRequestSchema, { email: 'a@b.co', code: '123456' }), true);
  assert.equal(ok(EmailStartRequestSchema, { email: 'a@b.co' }), true);
});

test('AuthSignInResponse: phân biệt signed_in / needs_merge', () => {
  const signed = AuthSignInResponseSchema.parse({ status: 'signed_in', ...tokens, isGuest: false, providers: ['google', 'password'] });
  assert.equal(signed.status, 'signed_in');
  assert.equal(
    ok(AuthSignInResponseSchema, { status: 'signed_in', ...tokens, isGuest: false, providers: ['password'], restorable: { deleteAt: '2026-12-21T00:00:00.000Z' } }),
    true
  );
  assert.equal(ok(AuthSignInResponseSchema, { status: 'signed_in', ...tokens, isGuest: true, providers: [] }), false, 'tài khoản thật không là khách');
  assert.equal(ok(AuthSignInResponseSchema, { status: 'signed_in', ...tokens, isGuest: false, providers: ['facebook'] }), false);
  const merge = AuthSignInResponseSchema.parse({ status: 'needs_merge', mergeTicket: 't'.repeat(32), target: { createdAt: '2026-11-01T00:00:00.000Z', hasProgress: true } });
  assert.equal(merge.status, 'needs_merge');
  assert.equal(ok(AuthSignInResponseSchema, { status: 'needs_merge', ...tokens }), false, 'needs_merge thiếu ticket');
  assert.equal(ok(AuthSignInResponseSchema, { status: 'other', ...tokens }), false);
});

test('Đăng ký / đăng nhập / Google / gộp / đăng xuất', () => {
  assert.deepEqual(AuthRegisterRequestSchema.parse({ username: ' Mai.Le ', password: 'mat-khau-dai' }), { username: 'mai.le', password: 'mat-khau-dai' });
  assert.equal(
    ok(AuthRegisterResponseSchema, { status: 'signed_in', ...tokens, isGuest: false, providers: ['password'], backupCode: 'ABCD-EFGH-JKMN-PQRS' }),
    true
  );
  assert.equal(ok(AuthRegisterResponseSchema, { status: 'signed_in', ...tokens, isGuest: false, providers: ['password'] }), false, 'thiếu backupCode');
  assert.equal(AuthPasswordLoginRequestSchema.parse({ username: 'MAI', password: '12345678' }).username, 'mai');
  assert.equal(ok(AuthGoogleRequestSchema, { idToken: 'x'.repeat(100), nonce: 'n'.repeat(32) }), true);
  assert.equal(ok(AuthGoogleRequestSchema, { idToken: 'x'.repeat(100) }), false);
  assert.equal(ok(AuthNonceResponseSchema, { nonce: 'n'.repeat(32), expiresIn: 600 }), true);
  assert.equal(ok(AuthMergeRequestSchema, { mergeTicket: 't'.repeat(32), strategy: 'merge' }), true);
  assert.equal(ok(AuthMergeRequestSchema, { mergeTicket: 't'.repeat(32), strategy: 'both' }), false);
  assert.equal(ok(AuthLogoutRequestSchema, { refreshToken: 'r'.repeat(40) }), true);
  assert.equal(ok(AuthLogoutRequestSchema, { refreshToken: 'r'.repeat(40), everywhere: true }), true);
});

test('Quên / đặt lại / đổi mật khẩu, mã dự phòng', () => {
  assert.equal(ok(PasswordForgotRequestSchema, { usernameOrEmail: 'mai.le' }), true);
  assert.equal(ok(PasswordResetWithEmailRequestSchema, { usernameOrEmail: 'a@b.co', code: '123456', newPassword: '12345678' }), true);
  assert.equal(ok(PasswordResetWithEmailRequestSchema, { usernameOrEmail: 'a@b.co', code: '123456', newPassword: 'short' }), false);
  const r = PasswordResetWithBackupRequestSchema.parse({ username: 'Mai.Le', backupCode: 'abcd efgh jkmn pqrs', newPassword: '12345678' });
  assert.equal(r.username, 'mai.le');
  assert.equal(r.backupCode, 'ABCDEFGHJKMNPQRS', 'mã dự phòng chuẩn hóa như mã khôi phục');
  assert.equal(ok(BackupCodeResponseSchema, { backupCode: 'ABCD-EFGH-JKMN-PQRS' }), true);
  assert.equal(ok(PasswordChangeRequestSchema, { currentPassword: 'x', newPassword: '12345678' }), true);
});

test('Danh tính, xóa mềm, khôi phục, mã lỗi', () => {
  assert.equal(ok(IdentityListResponseSchema, { identities: [{ id: uid, provider: 'google', display: 'm***@gmail.com' }] }), true);
  assert.equal(ok(DeleteMeRequestSchema, { mode: 'grace' }), true);
  assert.equal(ok(DeleteMeRequestSchema, { mode: 'later' }), false);
  assert.equal(ok(DeleteMeResultSchema, { deleteAt: '2026-12-21T00:00:00.000Z' }), true);
  assert.equal(ok(DeleteMeResultSchema, { deleteAt: null }), true);
  assert.equal(ok(RestoreAccountRequestSchema, {}), true);
  for (const code of [
    'invalid_credentials', 'username_taken', 'weak_password', 'identity_in_use', 'last_identity', 'account_merged',
    'account_upgraded', 'account_pending_deletion', 'provider_unavailable', 'otp_invalid', 'otp_expired', 'otp_locked', 'rate_limited'
  ]) {
    assert.ok(Object.values(AuthErrorCode).includes(code), code);
  }
});
