import test from 'node:test';
import assert from 'node:assert/strict';
import { configureGateway, GatewayRequestError } from '../dist/index.js';
import { createSocialRest } from '../dist/social/rest.js';
import { CID, U1, msg, page, mid, cmid } from './social-helpers.mjs';

const realFetch = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = realFetch;
  configureGateway({ getToken: undefined, onUnauthorized: undefined });
});
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const noContent = () => new Response(null, { status: 204 });

function boot(handler) {
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), init });
    return handler(seen.length - 1, String(url), init);
  };
  configureGateway({ baseUrl: 'http://gw.test', timeoutMs: 500, getToken: async () => 'tok-abc' });
  return { seen, rest: createSocialRest() };
}

test('listMessages: query afterSeq/limit, Bearer qua phiên hiện có, kết quả qua Zod', async () => {
  const { seen, rest } = boot(() => json(page([msg(6), msg(7)])));
  const p = await rest.listMessages(CID, { afterSeq: 5, limit: 50 });
  assert.equal(seen[0].url, `http://gw.test/v1/chat/conversations/${CID}/messages?afterSeq=5&limit=50`);
  assert.equal(seen[0].init.headers.Authorization, 'Bearer tok-abc');
  assert.deepEqual(p.messages.map((m) => m.seq), [6, 7]);
});

test('listMessages: cả beforeSeq và afterSeq => từ chối trước khi gọi mạng', async () => {
  const { seen, rest } = boot(() => json(page([])));
  await assert.rejects(rest.listMessages(CID, { beforeSeq: 9, afterSeq: 5 }), (e) => e instanceof GatewayRequestError && e.kind === 'invalid-request');
  assert.equal(seen.length, 0);
});

test('phản hồi sai schema bị từ chối (kind contract), không đưa dữ liệu lệch lên giao diện', async () => {
  const { rest } = boot(() => json({ messages: [{ id: 'x', seq: 'một' }], hasMore: false }));
  await assert.rejects(rest.listMessages(CID, {}), (e) => e instanceof GatewayRequestError && e.kind === 'contract');
});

test('401 giữa phiên: làm mới rồi gửi lại ĐÚNG một lần', async () => {
  let n = 0;
  const { seen, rest } = boot(() => (++n === 1 ? json({ error: 'unauthorized' }, 401) : json(page([msg(1)]))));
  let refreshed = 0;
  configureGateway({
    onUnauthorized: async () => {
      refreshed++;
      return true;
    }
  });
  const p = await rest.listMessages(CID, {});
  assert.equal(refreshed, 1);
  assert.equal(seen.length, 2);
  assert.equal(p.messages.length, 1);
});

test('401 hai lần liên tiếp => lỗi unauthorized, không lặp vô hạn', async () => {
  const { seen, rest } = boot(() => json({ error: 'unauthorized' }, 401));
  configureGateway({ onUnauthorized: async () => true });
  await assert.rejects(rest.listMessages(CID, {}), (e) => e.kind === 'unauthorized');
  assert.equal(seen.length, 2);
});

test('lỗi Gateway chuẩn hóa: mã máy đọc được trong .code (vd. not_a_member 403, chat_rate 429)', async () => {
  const { rest } = boot(() => json({ error: 'not_a_member' }, 403));
  await assert.rejects(rest.listMessages(CID, {}), (e) => e.code === 'not_a_member' && e.status === 403);
  globalThis.fetch = async () => json({ error: 'chat_rate' }, 429);
  await assert.rejects(rest.sendMessage(CID, { clientMsgId: cmid(1), kind: 'text', body: 'a' }), (e) => e.kind === 'quota' && e.code === 'chat_rate');
});

test('mất mạng => lỗi offline', async () => {
  const { rest } = boot(() => {
    throw new TypeError('fetch failed');
  });
  await assert.rejects(rest.listConversations(), (e) => e.kind === 'offline');
});

test('sendMessage: kiểm thân theo contract trước khi gửi; trả duplicate khi gửi lại', async () => {
  const { seen, rest } = boot(() => json({ id: mid(1), seq: 3, createdAt: '2026-11-26T01:00:00.000Z', duplicate: true }));
  await assert.rejects(rest.sendMessage(CID, { clientMsgId: cmid(1), kind: 'text', body: '  ' }), (e) => e.kind === 'invalid-request');
  await assert.rejects(rest.sendMessage(CID, { clientMsgId: cmid(1), kind: 'text', body: 'a', attachmentId: cmid(2) }), (e) => e.kind === 'invalid-request');
  assert.equal(seen.length, 0);
  const r = await rest.sendMessage(CID, { clientMsgId: cmid(1), kind: 'text', body: 'xin chào' });
  assert.equal(r.duplicate, true);
  assert.equal(seen[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(seen[0].init.body), { clientMsgId: cmid(1), kind: 'text', body: 'xin chào' });
});

test('declareAge: PUT /v1/me/age; năm sinh sai bị chặn, thông báo lỗi KHÔNG phản chiếu giá trị', async () => {
  const { seen, rest } = boot(() => json({ isAdult: true, lockedUntil: null }));
  const bad = await rest.declareAge(1850).catch((e) => e);
  assert.ok(bad instanceof GatewayRequestError);
  assert.equal(bad.kind, 'invalid-request');
  assert.ok(!String(bad.message).includes('1850'));
  assert.equal(seen.length, 0);
  const r = await rest.declareAge(1990);
  assert.equal(r.isAdult, true);
  assert.equal(seen[0].init.method, 'PUT');
  assert.ok(seen[0].url.endsWith('/v1/me/age'));
});

test('handle / chặn / lời mời: đường dẫn và phương thức đúng; 204 không cần thân', async () => {
  const { seen, rest } = boot((i) => (i === 0 ? json({ handle: 'be.cu' }) : noContent()));
  assert.deepEqual(await rest.setHandle('Be.Cu'), { handle: 'be.cu' });
  assert.deepEqual(JSON.parse(seen[0].init.body), { handle: 'be.cu' });
  await rest.blockUser(U1);
  await rest.unblockUser(U1);
  await rest.sendFriendRequest('be.cu');
  await rest.acceptFriendRequest(mid(1));
  await rest.declineFriendRequest(mid(1));
  assert.deepEqual(
    seen.slice(1).map((s) => `${s.init.method} ${s.url.replace('http://gw.test', '')}`),
    [
      `PUT /v1/chat/blocks/${U1}`,
      `DELETE /v1/chat/blocks/${U1}`,
      'POST /v1/friends/requests',
      `POST /v1/friends/requests/${mid(1)}/accept`,
      `POST /v1/friends/requests/${mid(1)}/decline`
    ]
  );
});

test('handle_not_found: mọi lỗi cùng một dạng, client không phân biệt', async () => {
  const { rest } = boot(() => json({ error: 'handle_not_found' }, 404));
  const e = await rest.sendFriendRequest('ai.do').catch((x) => x);
  assert.equal(e.code, 'handle_not_found');
});

test('listConversations + markRead + recall/restore + mute + hide', async () => {
  const conv = { id: CID, kind: 'dm', title: null, lastSeq: 9, unread: 2, muted: false };
  const { seen, rest } = boot((i) => (i === 0 ? json({ conversations: [conv], nextCursor: null }) : noContent()));
  const list = await rest.listConversations({ cursor: 'c1', limit: 20 });
  assert.equal(list.conversations[0].lastSeq, 9);
  assert.ok(seen[0].url.endsWith('/v1/chat/conversations?cursor=c1&limit=20'));
  await rest.markRead(CID, 9);
  await rest.recallMessage(mid(1));
  await rest.restoreMessage(mid(1));
  await rest.hideConversation(CID);
  await rest.muteConversation(CID, null);
  assert.deepEqual(
    seen.slice(1).map((s) => `${s.init.method} ${s.url.replace('http://gw.test', '')}`),
    [
      `POST /v1/chat/conversations/${CID}/read`,
      `POST /v1/chat/messages/${mid(1)}/recall`,
      `POST /v1/chat/messages/${mid(1)}/restore`,
      `POST /v1/chat/conversations/${CID}/hide`,
      `PUT /v1/chat/conversations/${CID}/mute`
    ]
  );
});

test('uploadAttachment: multipart, trả attachmentId', async () => {
  const { seen, rest } = boot(() => json({ attachmentId: mid(5) }));
  const r = await rest.uploadAttachment(CID, new Blob(['x'], { type: 'image/webp' }), 'image');
  assert.equal(r.attachmentId, mid(5));
  assert.ok(seen[0].init.body instanceof FormData);
  assert.equal(seen[0].init.headers['Content-Type'], undefined, 'để trình duyệt tự đặt boundary');
});

test('createGroup / createDm / báo cáo / push-token / cài đặt kiểm thân theo contract', async () => {
  const conv = { id: CID, kind: 'group', title: 'Lớp', lastSeq: 0, unread: 0, muted: false };
  const { seen, rest } = boot((i) => (i < 2 ? json(conv) : i === 2 ? json({ id: mid(9) }) : noContent()));
  await assert.rejects(rest.createGroup({ title: '', memberIds: [U1] }), (e) => e.kind === 'invalid-request');
  await rest.createGroup({ title: 'Lớp', memberIds: [U1] });
  await rest.createDm(mid(2));
  assert.deepEqual(await rest.report({ conversationId: CID, reportedUserId: U1, reason: 'spam' }), { id: mid(9) });
  await rest.registerPushToken({ token: 't'.repeat(30), platform: 'android', appBuild: 1, locale: 'vi' });
  await rest.unregisterPushToken('t'.repeat(30));
  assert.equal(seen.length, 5);
  assert.ok(seen[4].url.endsWith(`/v1/chat/push-tokens/${'t'.repeat(30)}`));
});
