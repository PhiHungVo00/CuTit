import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAT_LIMITS,
  WS_LIMITS,
  CALL_LIMITS,
  ChatErrorCode,
  FriendErrorCode,
  AgeDeclareRequestSchema,
  AgeDeclareResponseSchema,
  isAdultFromBirthYear,
  HandleSchema,
  SendMessageRequestSchema,
  MessagesQuerySchema,
  MessageSchema,
  WsServerFrameSchema,
  WsClientFrameSchema,
  WsHelloSchema,
  CallJoinInfoSchema,
  CallStartSchema,
  CallStatsSchema,
  ReportCreateSchema,
  GroupCreateSchema,
  PushTokenSchema,
  FriendRequestCreateSchema,
  FriendQuestSchema,
  SocialSettingsUpdateSchema,
  SystemEventSchema
} from '../dist/api/index.js';

const U = '3f2b8c1e-5d4a-4e7b-9c1d-2a6f8e0b7c11';
const U2 = '7a1d9f02-33c4-4b8e-8f55-0d2c9e41ab22';
const ok = (s, v) => assert.equal(s.safeParse(v).success, true, JSON.stringify(v));
const bad = (s, v) => assert.equal(s.safeParse(v).success, false, JSON.stringify(v));
const YEAR = new Date().getUTCFullYear();

test('hằng số khớp kế hoạch', () => {
  assert.equal(CHAT_LIMITS.bodyMax, 4000);
  assert.equal(CHAT_LIMITS.imageBytes, 2 * 2 ** 20);
  assert.equal(CHAT_LIMITS.voiceMs, 120_000);
  assert.equal(WS_LIMITS.frameMaxBytes, 16 * 1024);
  assert.equal(WS_LIMITS.connectionsPerUser, 3);
  assert.equal(CALL_LIMITS.maxParticipants, 6);
  assert.equal(CALL_LIMITS.signalMaxBytes, 8 * 1024);
  assert.equal(ChatErrorCode.handleNotFound, FriendErrorCode.handleNotFound);
  assert.equal(ChatErrorCode.handleTaken, FriendErrorCode.handleTaken);
});

test('isAdultFromBirthYear: đủ 18 năm kể từ năm sinh (người dùng chốt 26/11)', () => {
  const now = new Date(Date.UTC(2026, 10, 26));
  assert.equal(isAdultFromBirthYear(2026 - 19, now), true);
  assert.equal(isAdultFromBirthYear(2026 - 18, now), true); // đúng 18 năm trước: tính là đủ
  assert.equal(isAdultFromBirthYear(2026 - 17, now), false);
  assert.equal(isAdultFromBirthYear(1900, now), true);
  assert.equal(isAdultFromBirthYear(2026, now), false);
  // biên năm theo UTC
  assert.equal(isAdultFromBirthYear(2008, new Date(Date.UTC(2026, 0, 1))), true);
  assert.equal(isAdultFromBirthYear(2008, new Date(Date.UTC(2025, 11, 31))), false);
});

test('AgeDeclareRequestSchema: 1900..năm hiện tại, số nguyên, strict, KHÔNG phản chiếu giá trị trong lỗi', () => {
  ok(AgeDeclareRequestSchema, { birthYear: 1900 });
  ok(AgeDeclareRequestSchema, { birthYear: YEAR });
  bad(AgeDeclareRequestSchema, { birthYear: 1899 });
  bad(AgeDeclareRequestSchema, { birthYear: YEAR + 1 });
  bad(AgeDeclareRequestSchema, { birthYear: 1990.5 });
  bad(AgeDeclareRequestSchema, { birthYear: '1990' });
  bad(AgeDeclareRequestSchema, {});
  bad(AgeDeclareRequestSchema, { birthYear: 1990, month: 3 });
  for (const v of [1899, YEAR + 1, 1990.5, '1990', 7777]) {
    const r = AgeDeclareRequestSchema.safeParse({ birthYear: v });
    assert.equal(JSON.stringify(r.error?.issues ?? []).includes(String(v)), false, `lỗi không được chứa ${v}`);
  }
  ok(AgeDeclareResponseSchema, { isAdult: false, lockedUntil: '2027-11-26T00:00:00.000Z' });
  ok(AgeDeclareResponseSchema, { isAdult: true, lockedUntil: null });
  // phản hồi không có trường năm sinh
  bad(AgeDeclareResponseSchema, { isAdult: true });
});

test('HandleSchema: 3–24, a-z0-9._, không đầu/cuối ".", không "..", chuẩn hóa chữ thường', () => {
  assert.equal(HandleSchema.parse('Anh'), 'anh');
  assert.equal(HandleSchema.parse('  an.h_9 '), 'an.h_9');
  for (const v of ['ab', 'a..b', '.ab', 'ab.', 'a'.repeat(25), 'ánh', 'a b', 'a-b', 'admin', 'Kelvin', '']) bad(HandleSchema, v);
  ok(HandleSchema, 'a'.repeat(24));
  ok(HandleSchema, 'abc');
});

test('SendMessageRequestSchema: đúng một nội dung theo kind, không gửi system', () => {
  const id = U;
  ok(SendMessageRequestSchema, { clientMsgId: id, kind: 'text', body: 'xin chào' });
  ok(SendMessageRequestSchema, { clientMsgId: id, kind: 'text', body: 'a'.repeat(4000) });
  bad(SendMessageRequestSchema, { clientMsgId: id, kind: 'text', body: 'a'.repeat(4001) });
  bad(SendMessageRequestSchema, { clientMsgId: id, kind: 'text' });
  bad(SendMessageRequestSchema, { clientMsgId: id, kind: 'text', body: '' });
  bad(SendMessageRequestSchema, { clientMsgId: id, kind: 'text', body: '   \n ' });
  bad(SendMessageRequestSchema, { clientMsgId: id, kind: 'text', body: 'x', attachmentId: U2 });
  ok(SendMessageRequestSchema, { clientMsgId: id, kind: 'image', attachmentId: U2 });
  ok(SendMessageRequestSchema, { clientMsgId: id, kind: 'voice', attachmentId: U2 });
  bad(SendMessageRequestSchema, { clientMsgId: id, kind: 'image' });
  bad(SendMessageRequestSchema, { clientMsgId: id, kind: 'image', attachmentId: 'abc' });
  bad(SendMessageRequestSchema, { clientMsgId: id, kind: 'image', attachmentId: U2, body: 'x' });
  bad(SendMessageRequestSchema, { clientMsgId: id, kind: 'system', body: 'x' });
  bad(SendMessageRequestSchema, { clientMsgId: 'không-phải-uuid', kind: 'text', body: 'x' });
  bad(SendMessageRequestSchema, { kind: 'text', body: 'x' });
  bad(SendMessageRequestSchema, { clientMsgId: id, kind: 'text', body: 'x', seq: 5 });
});

test('MessagesQuerySchema: giới hạn trang, không đồng thời beforeSeq và afterSeq', () => {
  assert.equal(MessagesQuerySchema.parse({}).limit, CHAT_LIMITS.pageDefault);
  assert.equal(MessagesQuerySchema.parse({ limit: '100', afterSeq: '5' }).afterSeq, 5);
  bad(MessagesQuerySchema, { limit: '101' });
  bad(MessagesQuerySchema, { limit: '0' });
  bad(MessagesQuerySchema, { beforeSeq: '0' });
  bad(MessagesQuerySchema, { beforeSeq: '3', afterSeq: '2' });
});

test('MessageSchema + SystemEvent', () => {
  const base = { id: U, cid: U2, seq: 1, kind: 'text', body: 'hi', createdAt: new Date().toISOString(), mine: false };
  ok(MessageSchema, base);
  ok(MessageSchema, { ...base, body: undefined, deleted: true });
  ok(MessageSchema, { ...base, body: undefined, blocked: true });
  bad(MessageSchema, { ...base, seq: 0 });
  bad(MessageSchema, { ...base, body: 'a'.repeat(4001) });
  ok(SystemEventSchema, { type: 'member_left', userId: U });
  bad(SystemEventSchema, { type: 'member_left' });
  bad(SystemEventSchema, { type: 'hack', userId: U });
});

test('WsServerFrameSchema: union chặt, bắt khung rác', () => {
  const m = { id: U, cid: U2, seq: 2, kind: 'text', body: 'hi', createdAt: new Date().toISOString(), mine: false };
  ok(WsServerFrameSchema, { t: 'hello_ok', serverTime: new Date().toISOString(), expSec: 900 });
  ok(WsServerFrameSchema, { t: 'msg', message: m });
  ok(WsServerFrameSchema, { t: 'ping' });
  ok(WsServerFrameSchema, { t: 'read', cid: U, userId: U2, seq: 3 });
  ok(WsServerFrameSchema, { t: 'call.invite', callId: U, cid: U2, kind: 'video', from: { id: U2, displayName: 'An' } });
  ok(WsServerFrameSchema, { t: 'call.end', callId: U, reason: 'no_answer' });
  bad(WsServerFrameSchema, { cid: U });
  bad(WsServerFrameSchema, { t: 'không_biết' });
  bad(WsServerFrameSchema, { t: 'msg' });
  bad(WsServerFrameSchema, { t: 'msg', message: m, extra: 1 });
  bad(WsServerFrameSchema, { t: 'ping', x: 1 });
  bad(WsServerFrameSchema, { t: 'read', cid: 'x', userId: U2, seq: 3 });
  bad(WsServerFrameSchema, { t: 'call.end', callId: U, reason: 'vì_thích' });
  bad(WsServerFrameSchema, null);
  bad(WsServerFrameSchema, 'ping');
  // đủ mọi loại khung theo kế hoạch
  for (const t of ['hello_ok', 'auth_expiring', 'msg', 'recall', 'restore', 'read', 'typing', 'presence', 'member', 'conv', 'friend', 'call.invite', 'call.state', 'call.signal', 'call.end', 'error', 'ping']) {
    assert.ok(WsServerFrameSchema.options.some((o) => o.shape.t.value === t), `thiếu khung server ${t}`);
  }
});

test('WsClientFrameSchema: hello trong 5 giây, KHÔNG có khung gửi tin', () => {
  const hello = { t: 'hello', v: 1, token: 'x'.repeat(30), build: 123, device: U };
  ok(WsClientFrameSchema, hello);
  ok(WsHelloSchema, hello);
  bad(WsClientFrameSchema, { ...hello, v: 2 });
  bad(WsClientFrameSchema, { ...hello, token: 'ngắn' });
  bad(WsClientFrameSchema, { ...hello, device: 'abc' });
  ok(WsClientFrameSchema, { t: 'auth', token: 'x'.repeat(30) });
  ok(WsClientFrameSchema, { t: 'typing', cid: U });
  ok(WsClientFrameSchema, { t: 'visibility', foreground: true });
  ok(WsClientFrameSchema, { t: 'pong' });
  ok(WsClientFrameSchema, { t: 'call.accept', callId: U });
  ok(WsClientFrameSchema, { t: 'call.signal', callId: U, to: U2, data: { sdp: 'v=0' } });
  bad(WsClientFrameSchema, { t: 'msg', cid: U, body: 'gửi tin bằng WS' });
  bad(WsClientFrameSchema, { t: 'send', cid: U });
  bad(WsClientFrameSchema, { t: 'typing' });
  bad(WsClientFrameSchema, { t: 'visibility', foreground: 'yes' });
  // báo hiệu quá 8 KB
  bad(WsClientFrameSchema, { t: 'call.signal', callId: U, to: U2, data: { sdp: 'a'.repeat(8200) } });
  for (const t of ['hello', 'auth', 'typing', 'visibility', 'call.accept', 'call.decline', 'call.join', 'call.leave', 'call.signal', 'pong']) {
    assert.ok(WsClientFrameSchema.options.some((o) => o.shape.t.value === t), `thiếu khung client ${t}`);
  }
});

test('Gọi: CallJoinInfo là union theo mode; CallStart; CallStats', () => {
  ok(CallJoinInfoSchema, { mode: 'mesh', iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }], maxParticipants: 6 });
  ok(CallJoinInfoSchema, { mode: 'mesh', iceServers: [{ urls: ['turn:a?transport=udp', 'turns:a:443'], username: 'u', credential: 'c' }], maxParticipants: 6 });
  ok(CallJoinInfoSchema, { mode: 'sfu', url: 'wss://lk.example.com', token: 't', roomName: 'r' });
  bad(CallJoinInfoSchema, { mode: 'sfu', url: 'wss://lk.example.com', roomName: 'r' }); // thiếu token
  bad(CallJoinInfoSchema, { mode: 'sfu', url: 'không-phải-url', token: 't', roomName: 'r' });
  bad(CallJoinInfoSchema, { mode: 'mesh', maxParticipants: 6 });
  bad(CallJoinInfoSchema, { mode: 'p2p', iceServers: [], maxParticipants: 6 });
  bad(CallJoinInfoSchema, { mode: 'mesh', iceServers: [], maxParticipants: 6, token: 'lẫn' });
  ok(CallStartSchema, { conversationId: U, kind: 'voice' });
  ok(CallStartSchema, { conversationId: U, kind: 'video', inviteIds: [U2] });
  bad(CallStartSchema, { conversationId: U, kind: 'screen' });
  bad(CallStartSchema, { conversationId: U, kind: 'voice', inviteIds: Array(6).fill(U2) });
  ok(CallStatsSchema, { relaySeconds: 10 });
  bad(CallStatsSchema, { relaySeconds: -1 });
  bad(CallStatsSchema, { relaySeconds: 1.5 });
});

test('Báo cáo, nhóm, push token, cài đặt', () => {
  ok(ReportCreateSchema, { conversationId: U, reportedUserId: U2, reason: 'spam' });
  ok(ReportCreateSchema, { conversationId: U, messageId: U2, reportedUserId: U2, reason: 'harassment', note: 'a'.repeat(500) });
  bad(ReportCreateSchema, { conversationId: U, reportedUserId: U2, reason: 'spam', note: 'a'.repeat(501) });
  bad(ReportCreateSchema, { conversationId: U, reportedUserId: U2, reason: 'ghét' });
  bad(ReportCreateSchema, { conversationId: U, reason: 'spam' });
  ok(GroupCreateSchema, { title: 'Lớp 12', memberIds: [U] });
  bad(GroupCreateSchema, { title: '', memberIds: [U] });
  bad(GroupCreateSchema, { title: 'a'.repeat(61), memberIds: [U] });
  bad(GroupCreateSchema, { title: 'ok', memberIds: [] });
  bad(GroupCreateSchema, { title: 'ok', memberIds: ['x'] });
  bad(GroupCreateSchema, { title: 'ok', memberIds: [U, U] });
  // báo hiệu tính theo BYTE (ký tự nhiều byte)
  bad(WsClientFrameSchema, { t: 'call.signal', callId: U, to: U2, data: { s: 'é'.repeat(5000) } });
  ok(PushTokenSchema, { token: 't'.repeat(40), platform: 'android', appBuild: 12, locale: 'vi' });
  bad(PushTokenSchema, { token: 't'.repeat(40), platform: 'ios', appBuild: 12, locale: 'vi' });
  bad(PushTokenSchema, { token: 'ngắn', platform: 'android', appBuild: 12, locale: 'vi' });
  bad(PushTokenSchema, { token: 't'.repeat(40), platform: 'android', appBuild: 12, locale: 'fr' });
  ok(SocialSettingsUpdateSchema, { showOnline: false });
  bad(SocialSettingsUpdateSchema, { showOnline: 'no' });
  bad(SocialSettingsUpdateSchema, { isAdult: true });
});

test('Kết bạn bằng handle + questActive tương thích ngược', () => {
  assert.deepEqual(FriendRequestCreateSchema.parse({ handle: 'Anh.Minh' }), { handle: 'anh.minh' });
  bad(FriendRequestCreateSchema, { handle: 'a..b' });
  bad(FriendRequestCreateSchema, {});
  const quest = {
    id: U,
    displayName: 'An',
    since: new Date().toISOString(),
    quest: {
      weekStart: '2026-11-23',
      weekEnd: '2026-11-29',
      goalMinutes: 60,
      totalMinutes: 0,
      completed: false,
      members: [
        { displayName: 'Tôi', minutes: 0, me: true },
        { displayName: 'An', minutes: 0, me: false }
      ],
      streakWeeks: 0
    }
  };
  ok(FriendQuestSchema, quest); // Gateway cũ chưa trả questActive vẫn hợp lệ
  ok(FriendQuestSchema, { ...quest, questActive: false });
  assert.equal(FriendErrorCode.handleNotFound, 'handle_not_found');
});
