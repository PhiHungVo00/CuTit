import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEEDBACK_LIMITS,
  FEEDBACK_IMAGE_TYPES,
  FEEDBACK_VIDEO_TYPES,
  FeedbackKindSchema,
  FeedbackStatusSchema,
  FeedbackContextSchema,
  FeedbackCreateMetaSchema,
  FeedbackCreateResponseSchema,
  FeedbackErrorCode,
  MyFeedbackSchema,
  MyFeedbackListSchema,
  UnreadCountSchema,
  AdminErrorCode,
  AdminLoginRequestSchema,
  AdminLoginResponseSchema,
  AdminEnrollRequestSchema,
  AdminEnrollResponseSchema,
  AdminTotpConfirmSchema,
  AdminTotpConfirmResponseSchema,
  AdminTotpRequestSchema,
  AdminSessionSchema,
  QueueQuerySchema,
  QueueItemSchema,
  QueueResponseSchema,
  AdminFeedbackDetailSchema,
  AdminStatusRequestSchema,
  SignedUrlSchema,
  AuditEntrySchema,
  AuditListResponseSchema
} from '../dist/api/index.js';

const ctx = (over = {}) => ({
  appVersion: '0.9.0',
  build: 'abc1234',
  platform: 'android',
  osVersion: 'Android 15',
  locale: 'vi',
  route: '/profile',
  recentRoutes: ['/learn', '/profile'],
  ...over
});
const meta = (over = {}) => ({ kind: 'bug', body: 'Nút gửi không bấm được', context: ctx(), ...over });
const ok = (schema, v) => assert.equal(schema.safeParse(v).success, true, JSON.stringify(schema.safeParse(v).error?.issues));
const bad = (schema, v) => assert.equal(schema.safeParse(v).success, false, `phải từ chối: ${JSON.stringify(v)}`);

test('Giới hạn góp ý đúng theo spec', () => {
  assert.deepEqual(FEEDBACK_LIMITS, {
    bodyMin: 10,
    bodyMax: 2000,
    images: 3,
    videos: 1,
    imageBytes: 5 * 2 ** 20,
    videoBytes: 50 * 2 ** 20,
    videoMs: 60_000,
    perDay: 5,
    replyMax: 1000
  });
  assert.deepEqual([...FEEDBACK_IMAGE_TYPES], ['image/webp', 'image/jpeg', 'image/png']);
  assert.deepEqual([...FEEDBACK_VIDEO_TYPES], ['video/mp4', 'video/webm', 'video/quicktime']);
});

test('FeedbackCreateMeta: body 10–2000 ký tự (sau khi cắt khoảng trắng đầu/cuối)', () => {
  ok(FeedbackCreateMetaSchema, meta({ body: 'a'.repeat(10) }));
  ok(FeedbackCreateMetaSchema, meta({ body: 'a'.repeat(2000) }));
  bad(FeedbackCreateMetaSchema, meta({ body: 'a'.repeat(9) }));
  bad(FeedbackCreateMetaSchema, meta({ body: 'a'.repeat(2001) }));
  // DB đếm ký tự (code point), không phải đơn vị UTF-16: 5 emoji (length 10) phải bị từ chối, 10 emoji được nhận
  bad(FeedbackCreateMetaSchema, meta({ body: '😀'.repeat(5) }));
  ok(FeedbackCreateMetaSchema, meta({ body: '😀'.repeat(10) }));
  bad(FeedbackCreateMetaSchema, meta({ body: `   ${'a'.repeat(9)}   ` }));
  assert.equal(FeedbackCreateMetaSchema.parse(meta({ body: `  ${'a'.repeat(10)}  ` })).body.length, 10);
});

test('FeedbackCreateMeta: kind chỉ bug|idea|other; không nhận trường lạ', () => {
  for (const kind of ['bug', 'idea', 'other']) ok(FeedbackKindSchema, kind);
  bad(FeedbackKindSchema, 'spam');
  bad(FeedbackCreateMetaSchema, meta({ kind: 'spam' }));
  bad(FeedbackCreateMetaSchema, { ...meta(), userId: '00000000-0000-4000-8000-000000000000' });
  bad(FeedbackCreateMetaSchema, meta({ context: { ...ctx(), email: 'a@b.c' } }));
});

test('FeedbackContext: recentRoutes ≤ 5, mỗi đường dẫn bắt đầu "/" và không có "?" hay "#"', () => {
  ok(FeedbackContextSchema, ctx({ recentRoutes: [] }));
  ok(FeedbackContextSchema, ctx({ recentRoutes: ['/a', '/b', '/c', '/d', '/e'] }));
  bad(FeedbackContextSchema, ctx({ recentRoutes: ['/a?x=1'] }));
  bad(FeedbackContextSchema, ctx({ recentRoutes: ['/a#frag'] }));
  bad(FeedbackContextSchema, ctx({ recentRoutes: ['a'] }));
  bad(FeedbackContextSchema, ctx({ recentRoutes: ['/a', '/b', '/c', '/d', '/e', '/f'] }));
  bad(FeedbackContextSchema, ctx({ route: '/gop-y?loai=loi' }));
  bad(FeedbackContextSchema, ctx({ route: 'profile' }));
  bad(FeedbackContextSchema, ctx({ route: `/${'a'.repeat(300)}` }));
});

test('FeedbackContext: nền tảng, ngôn ngữ, lỗi kèm theo', () => {
  ok(FeedbackContextSchema, ctx({ platform: 'web', locale: 'en' }));
  bad(FeedbackContextSchema, ctx({ platform: 'ios' }));
  bad(FeedbackContextSchema, ctx({ locale: 'fr' }));
  ok(FeedbackContextSchema, ctx({ error: { name: 'TypeError', firstFrame: 'at Foo (bar.js:1:2)' } }));
  bad(FeedbackContextSchema, ctx({ error: { name: 'TypeError' } }));
  bad(FeedbackContextSchema, ctx({ error: { name: 'x'.repeat(500), firstFrame: 'y' } }));
  bad(FeedbackContextSchema, ctx({ appVersion: '' }));
});

test('Phản hồi tạo góp ý: id là uuid', () => {
  ok(FeedbackCreateResponseSchema, { id: '5b1b8a0e-0000-4000-8000-000000000001' });
  bad(FeedbackCreateResponseSchema, { id: 'abc' });
});

const myFb = (over = {}) => ({
  id: '5b1b8a0e-0000-4000-8000-000000000001',
  kind: 'bug',
  body: 'Nội dung góp ý dài đủ',
  status: 'received',
  createdAt: '2026-11-25T10:00:00.000Z',
  unread: false,
  files: [{ media: 'image', purged: false }],
  events: [{ at: '2026-11-25T11:00:00.000Z', status: 'in_progress', message: null }],
  ...over
});

test('MyFeedback: danh sách, đếm chưa đọc, trạng thái hợp lệ', () => {
  ok(MyFeedbackSchema, myFb());
  ok(MyFeedbackListSchema, { items: [myFb(), myFb({ events: [] })] });
  bad(MyFeedbackSchema, myFb({ status: 'closed' }));
  bad(MyFeedbackSchema, myFb({ files: [{ media: 'audio', purged: false }] }));
  // người dùng KHÔNG nhận khóa/đường dẫn tệp
  assert.equal('blobKey' in MyFeedbackSchema.parse(myFb({ files: [{ media: 'image', purged: false, blobKey: 'x' }] })).files[0], false);
  ok(UnreadCountSchema, { count: 0 });
  bad(UnreadCountSchema, { count: -1 });
  for (const s of ['received', 'in_progress', 'done']) ok(FeedbackStatusSchema, s);
});

test('Mã lỗi mới có đủ và không trùng nhau', () => {
  const fb = Object.values(FeedbackErrorCode);
  for (const c of ['feedback_limit', 'file_too_large', 'file_type', 'too_many_files', 'video_too_long', 'storage_full']) assert.ok(fb.includes(c), c);
  const ad = Object.values(AdminErrorCode);
  for (const c of ['admin_disabled', 'invalid_credentials', 'totp_invalid', 'totp_required', 'session_expired']) assert.ok(ad.includes(c), c);
  assert.equal(new Set(fb).size, fb.length, 'FeedbackErrorCode không trùng giá trị');
  assert.equal(new Set(ad).size, ad.length, 'AdminErrorCode không trùng giá trị');
  assert.equal(AdminErrorCode.invalidCredentials, 'invalid_credentials');
});

// ---------- Quản trị ----------

test('AdminTotpRequest: đúng MỘT trong code (6 số) hoặc backupCode', () => {
  const ticket = 't'.repeat(32);
  ok(AdminTotpRequestSchema, { ticket, code: '123456' });
  ok(AdminTotpRequestSchema, { ticket, backupCode: 'abcde-12345' });
  bad(AdminTotpRequestSchema, { ticket, code: '123456', backupCode: 'abcde-12345' });
  bad(AdminTotpRequestSchema, { ticket });
  bad(AdminTotpRequestSchema, { ticket, code: '12345' });
  bad(AdminTotpRequestSchema, { ticket, code: '1234567' });
  bad(AdminTotpRequestSchema, { ticket, code: '12a456' });
  bad(AdminTotpRequestSchema, { ticket, backupCode: 'x' });
  // mã dự phòng gõ HOA vẫn nhận (chuẩn hóa chữ thường)
  assert.equal(AdminTotpRequestSchema.parse({ ticket, backupCode: 'ABCDE-12345' }).backupCode, 'abcde-12345');
});

test('Đăng nhập quản trị: hình dạng yêu cầu/phản hồi', () => {
  ok(AdminLoginRequestSchema, { username: 'chuapp', password: 'x' });
  bad(AdminLoginRequestSchema, { username: '', password: 'x' });
  bad(AdminLoginRequestSchema, { username: 'chuapp', password: '' });
  bad(AdminLoginRequestSchema, { username: 'chuapp', password: 'x'.repeat(129) });
  ok(AdminLoginResponseSchema, { ticket: 't'.repeat(32), next: 'totp' });
  ok(AdminLoginResponseSchema, { ticket: 't'.repeat(32), next: 'enroll' });
  bad(AdminLoginResponseSchema, { ticket: 't'.repeat(32), next: 'done' });
  ok(AdminEnrollRequestSchema, { ticket: 't'.repeat(32), inviteCode: 'abcde-fghij-12345' });
  ok(AdminEnrollRequestSchema, { ticket: 't'.repeat(32), inviteCode: ' ABCDE-FGHIJ-12345 ' });
  bad(AdminEnrollRequestSchema, { ticket: 't'.repeat(32) }); // mã mời bắt buộc
  bad(AdminEnrollRequestSchema, { ticket: 't'.repeat(32), inviteCode: 'abcde-fghij' });
  bad(AdminEnrollRequestSchema, { ticket: 't'.repeat(600), inviteCode: 'abcde-fghij-12345' });
  ok(AdminEnrollResponseSchema, { otpauthUrl: 'otpauth://totp/BeCuTit:chuapp?secret=ABC&issuer=BeCuTit', secret: 'ABCDEFGH' });
  bad(AdminEnrollResponseSchema, { otpauthUrl: 'https://evil.example/', secret: 'ABCDEFGH' });
  ok(AdminTotpConfirmSchema, { ticket: 't'.repeat(32), code: '123456' });
  bad(AdminTotpConfirmSchema, { ticket: 't'.repeat(32), code: '12345' });
  ok(AdminSessionSchema, { accessToken: 'a.b.c', expiresIn: 600 });
  bad(AdminSessionSchema, { accessToken: 'a.b.c', expiresIn: 0 });
});

test('AdminTotpConfirmResponse: phiên + đúng 10 mã dự phòng', () => {
  const codes = Array.from({ length: 10 }, (_, i) => `abcd${i}-12345`);
  ok(AdminTotpConfirmResponseSchema, { accessToken: 'a.b.c', expiresIn: 600, backupCodes: codes });
  bad(AdminTotpConfirmResponseSchema, { accessToken: 'a.b.c', expiresIn: 600, backupCodes: codes.slice(0, 9) });
  bad(AdminTotpConfirmResponseSchema, { accessToken: 'a.b.c', expiresIn: 600, backupCodes: [...codes, 'abcde-11111'] });
});

test('Hàng chờ: truy vấn, dòng, phân trang', () => {
  assert.equal(QueueQuerySchema.parse({}).type, 'feedback');
  assert.equal(QueueQuerySchema.parse({}).limit, 30);
  ok(QueueQuerySchema, { type: 'feedback', status: 'received', kind: 'bug', cursor: 'abc', limit: '50' });
  bad(QueueQuerySchema, { type: 'chat_report' }); // dự án 4 mới thêm
  bad(QueueQuerySchema, { status: 'closed' });
  bad(QueueQuerySchema, { limit: '0' });
  bad(QueueQuerySchema, { limit: '101' });
  const item = {
    type: 'feedback',
    id: '5b1b8a0e-0000-4000-8000-000000000001',
    kind: 'bug',
    excerpt: 'x'.repeat(120),
    status: 'received',
    appVersion: '0.9.0',
    route: '/profile',
    fileCount: 2,
    createdAt: '2026-11-25T10:00:00.000Z',
    accountPendingDeletion: false
  };
  ok(QueueItemSchema, item);
  bad(QueueItemSchema, { ...item, excerpt: 'x'.repeat(121) });
  ok(QueueResponseSchema, { items: [item], nextCursor: null, pendingCount: 1 });
  bad(QueueResponseSchema, { items: [item], pendingCount: 1 });
});

test('Chi tiết góp ý (quản trị): có context, mã người dùng rút gọn, KHÔNG email', () => {
  const d = {
    ...myFb(),
    context: ctx(),
    userIdShort: 'a1b2c3d4',
    accountPendingDeletion: false,
    doneAt: null,
    files: [{ id: '5b1b8a0e-0000-4000-8000-0000000000aa', media: 'video', contentType: 'video/mp4', bytes: 1024, durationMs: null, purged: false }]
  };
  ok(AdminFeedbackDetailSchema, d);
  bad(AdminFeedbackDetailSchema, { ...d, userIdShort: 'a'.repeat(40) });
  bad(AdminFeedbackDetailSchema, { ...d, files: [{ ...d.files[0], contentType: 'application/x-msdownload' }] });
  assert.equal('email' in AdminFeedbackDetailSchema.parse({ ...d, email: 'a@b.c' }), false);
});

test('Đổi trạng thái: lời nhắn ≤ 1000, không rỗng', () => {
  ok(AdminStatusRequestSchema, { status: 'done' });
  ok(AdminStatusRequestSchema, { status: 'in_progress', message: 'Đang sửa' });
  ok(AdminStatusRequestSchema, { status: 'in_progress', message: 'a'.repeat(1000) });
  bad(AdminStatusRequestSchema, { status: 'in_progress', message: 'a'.repeat(1001) });
  bad(AdminStatusRequestSchema, { status: 'in_progress', message: '   ' });
  bad(AdminStatusRequestSchema, { status: 'nope' });
  bad(AdminStatusRequestSchema, {});
});

test('URL ký + nhật ký quản trị', () => {
  ok(SignedUrlSchema, { url: '/admin/v1/blob?k=a&exp=1&sig=b', expiresAt: '2026-11-25T10:05:00.000Z' });
  bad(SignedUrlSchema, { url: '', expiresAt: '2026-11-25T10:05:00.000Z' });
  const e = { id: 1, at: '2026-11-25T10:00:00.000Z', actorKind: 'cli', actorUserIdShort: null, action: 'role.grant', targetType: 'user', targetId: 'abc', meta: { role: 'owner' } };
  ok(AuditEntrySchema, e);
  ok(AuditEntrySchema, { ...e, actorKind: 'user', actorUserIdShort: 'a1b2c3d4', targetId: null });
  bad(AuditEntrySchema, { ...e, actorKind: 'robot' });
  bad(AuditEntrySchema, { ...e, action: 'user.delete_everything' });
  ok(AuditListResponseSchema, { items: [e], nextCursor: null });
});
