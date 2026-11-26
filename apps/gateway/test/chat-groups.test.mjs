import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '../dist/db/client.js';
import { befriend, call, chatApp, openDm, person, sendHttp } from './chat-helpers.mjs';

/** Dự án 4 Task 12 — nhóm học: vai trò, thành viên, tin hệ thống, nhóm lớn, ca xấu (leo thang quyền, đua, IDOR) */
let t;
before(async () => {
  t = await chatApp({ GROUP_SOFT_CAP: '1000' });
});
after(() => t.close());

const GP = '/v1/chat/groups';
const create = (u, title, members) => call(t, u, 'POST', '/v1/chat/conversations', { title, memberIds: members.map((m) => m.userId) });
const people = async (prefix, n) => Promise.all(Array.from({ length: n }, (_, i) => person(t, `${prefix}${i}`)));

/** Nhóm thật: chủ + thành viên đều là bạn của chủ */
async function group(prefix, n = 2) {
  const owner = await person(t, `${prefix}-chu`);
  const ms = await people(`${prefix}-tv`, n);
  for (const m of ms) await befriend(t, owner, m);
  const r = await create(owner, `Nhóm ${prefix}`, ms);
  assert.equal(r.statusCode, 200, r.body);
  return { owner, ms, cid: r.json().id };
}
const roleOf = async (cid, u) => {
  const db = await t.dbp.get();
  const [m] = await db.select().from(schema.conversationMembers).where(and(eq(schema.conversationMembers.conversationId, cid), eq(schema.conversationMembers.userId, u.userId)));
  return m;
};
const activeCount = async (cid) => {
  const db = await t.dbp.get();
  return (await db.select().from(schema.conversationMembers).where(and(eq(schema.conversationMembers.conversationId, cid), isNull(schema.conversationMembers.leftAt)))).length;
};
const msgs = async (u, cid, q = '') => (await call(t, u, 'GET', `/v1/chat/conversations/${cid}/messages${q}`)).json();
const add = (u, cid, ms) => call(t, u, 'POST', `${GP}/${cid}/members`, { memberIds: ms.map((m) => m.userId) });
const kick = (u, cid, m) => call(t, u, 'DELETE', `${GP}/${cid}/members/${m.userId}`);
const setRole = (u, cid, m, role) => call(t, u, 'PUT', `${GP}/${cid}/members/${m.userId}/role`, { role });

test('Tạo nhóm: người tạo là chủ, bạn vào làm thành viên, có tin hệ thống group_created, khung conv phát tới mọi người', async () => {
  const { owner, ms, cid } = await group('t1', 2);
  const mine = (await call(t, owner, 'GET', `/v1/chat/conversations/${cid}`)).json();
  assert.equal(mine.kind, 'group');
  assert.equal(mine.myRole, 'owner');
  assert.equal(mine.memberCount, 3);
  assert.equal((await call(t, ms[0], 'GET', `/v1/chat/conversations/${cid}`)).json().myRole, 'member');
  const page = await msgs(ms[0], cid);
  assert.equal(page.messages.length, 1);
  assert.equal(page.messages[0].kind, 'system');
  assert.equal(page.messages[0].system.type, 'group_created');
  assert.equal(page.messages[0].body, undefined);
  assert.equal((await call(t, ms[1], 'GET', '/v1/chat/conversations/unread')).json().total, 0, 'việc tạo nhóm không để lại chưa đọc');
  for (const u of [owner, ...ms]) assert.ok(t.bus.framesFor(u.userId).some((f) => f.t === 'conv' && f.cid === cid && f.change === 'created'));
});

test('Tạo nhóm: người không phải bạn / chặn hai chiều / dưới 18 / bị khóa → cùng một lỗi peer_unavailable và KHÔNG tạo gì', async () => {
  const db = await t.dbp.get();
  const owner = await person(t, 'x-chu');
  const [friend, stranger, blocked, blockedMe, minor, restricted] = await people('x-', 6);
  for (const f of [friend, blocked, blockedMe, minor, restricted]) await befriend(t, owner, f);
  await db.insert(schema.userBlocks).values([
    { blockerId: owner.userId, blockedId: blocked.userId },
    { blockerId: blockedMe.userId, blockedId: owner.userId }
  ]);
  t.gate.set(minor.userId, 'minor');
  t.gate.set(restricted.userId, 'restricted');
  const before = (await db.select().from(schema.conversations)).length;
  for (const bad of [stranger, blocked, blockedMe, minor, restricted]) {
    const r = await create(owner, 'Lạ', [friend, bad]);
    assert.equal(r.statusCode, 404, bad.name);
    assert.equal(r.json().error, 'peer_unavailable', bad.name);
  }
  assert.equal((await db.select().from(schema.conversations)).length, before, 'không tạo nhóm dở');
  // bản thân trong danh sách / trùng / tên rỗng → 400
  assert.equal((await create(owner, 'Tự', [owner])).statusCode, 400);
  assert.equal((await create(owner, '   ', [friend])).statusCode, 400);
  assert.equal((await call(t, owner, 'POST', '/v1/chat/conversations', { title: 'A', memberIds: [friend.userId, friend.userId] })).statusCode, 400);
  t.gate.set(minor.userId, null);
  t.gate.set(restricted.userId, null);
});

test('Người dưới 18 / khách / bị khóa KHÔNG gọi được route nhóm; người tạo bị chặn bởi cổng trước khi chạm DB', async () => {
  const { cid } = await group('gate', 1);
  const u = await person(t, 'gate-minor');
  t.gate.set(u.userId, 'minor');
  assert.equal((await create(u, 'Nhóm', [])).statusCode, 403, 'cổng chạy TRƯỚC khi đọc body');
  for (const [method, url, body] of [
    ['POST', '/v1/chat/conversations', { title: 'A', memberIds: [randomUUID()] }],
    ['POST', `${GP}/${cid}/members`, { memberIds: [randomUUID()] }],
    ['GET', `${GP}/${cid}/members`],
    ['POST', `${GP}/${cid}/leave`, {}],
    ['PUT', `${GP}/${cid}/title`, { title: 'x' }]
  ]) {
    const r = await call(t, u, method, url, body);
    assert.equal(r.statusCode, 403, `${method} ${url}`);
    assert.equal(r.json().error, 'adult_required');
  }
  t.gate.set(u.userId, 'restricted');
  assert.equal((await call(t, u, 'GET', `${GP}/${cid}/members`)).json().error, 'chat_restricted');
  t.gate.set(u.userId, null);
});

test('Tối đa 5 nhóm/ngày/người, kể cả khi gửi song song', async () => {
  const owner = await person(t, 'lim-chu');
  const f = await person(t, 'lim-f');
  await befriend(t, owner, f);
  const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => create(owner, `G${i}`, [f])));
  assert.equal(rs.filter((r) => r.statusCode === 200).length, 5, rs.map((r) => r.statusCode).join(','));
  assert.ok(rs.filter((r) => r.statusCode !== 200).every((r) => r.statusCode === 429 && r.json().error === 'chat_rate'));
});

test('Người mới KHÔNG thấy tin cũ; người bị xóa không đọc/ghi được; vào lại = người mới (không thấy tin lúc vắng)', async () => {
  const { owner, ms, cid } = await group('j1', 2);
  const late = await person(t, 'j1-late');
  await befriend(t, owner, late);
  assert.equal((await sendHttp(t, ms[0], cid, 'tin cũ 1')).statusCode, 200);
  assert.equal((await sendHttp(t, owner, cid, 'tin cũ 2')).statusCode, 200);
  assert.equal((await add(owner, cid, [late])).statusCode, 204);
  const seen = (await msgs(late, cid)).messages;
  assert.deepEqual(seen.map((m) => m.kind), ['system'], 'chỉ thấy tin hệ thống "được thêm"');
  assert.equal(seen[0].system.type, 'member_added');
  assert.equal((await sendHttp(t, owner, cid, 'tin mới')).statusCode, 200);
  assert.equal((await msgs(late, cid)).messages.at(-1).body, 'tin mới');
  assert.equal((await call(t, late, 'GET', '/v1/chat/conversations/unread')).json().total, 1, 'chỉ tin mới là chưa đọc');
  // xóa → mất quyền
  assert.equal((await kick(owner, cid, late)).statusCode, 204);
  assert.equal((await call(t, late, 'GET', `/v1/chat/conversations/${cid}/messages`)).statusCode, 403);
  assert.equal((await sendHttp(t, late, cid, 'còn gõ')).json().error, 'not_a_member');
  t.bus.clear();
  assert.equal((await sendHttp(t, owner, cid, 'sau khi xóa')).statusCode, 200);
  assert.ok(!t.bus.framesFor(late.userId).some((f) => f.t === 'msg'), 'người bị xóa không nhận tin mới');
  assert.equal((await call(t, late, 'GET', '/v1/chat/conversations')).json().conversations.filter((c) => c.id === cid).length, 0);
  // vào lại
  assert.equal((await add(owner, cid, [late])).statusCode, 204);
  const again = (await msgs(late, cid)).messages;
  assert.deepEqual(again.map((m) => m.system?.type ?? m.body), ['member_added'], 'không thấy "tin mới", "sau khi xóa"');
  assert.equal(again[0].seq > seen.at(-1).seq, true);
});

test('Quyền: chỉ chủ/quản trị thêm-xóa-đổi tên; chỉ chủ đổi vai trò; quản trị không xóa được quản trị/chủ; không tự nâng quyền', async () => {
  const { owner, ms, cid } = await group('p1', 4);
  const [adm, adm2, mem, mem2] = ms;
  const outsider = await person(t, 'p1-out');
  for (const u of [owner, adm, adm2]) await befriend(t, u, outsider).catch(() => {});
  assert.equal((await setRole(owner, cid, adm, 'admin')).statusCode, 204);
  assert.equal((await setRole(owner, cid, adm2, 'admin')).statusCode, 204);

  // thành viên thường: không làm được gì
  assert.equal((await add(mem, cid, [outsider])).json().error, 'forbidden');
  assert.equal((await kick(mem, cid, mem2)).json().error, 'forbidden');
  assert.equal((await call(t, mem, 'PUT', `${GP}/${cid}/title`, { title: 'chiếm tên' })).json().error, 'forbidden');
  assert.ok([400, 403].includes((await setRole(mem, cid, mem, 'admin')).statusCode), 'tự nâng quyền bị từ chối');
  assert.equal((await setRole(mem, cid, mem2, 'admin')).json().error, 'forbidden');
  assert.equal((await call(t, mem, 'DELETE', `${GP}/${cid}`)).json().error, 'forbidden');
  assert.equal((await roleOf(cid, mem)).role, 'member', 'không tự nâng quyền');

  // quản trị: đổi tên được, xóa thành viên thường được; không xóa quản trị khác/chủ, không đổi vai trò, không giải tán
  assert.equal((await call(t, adm, 'PUT', `${GP}/${cid}/title`, { title: 'Tên mới' })).statusCode, 204);
  assert.equal((await kick(adm, cid, adm2)).json().error, 'forbidden');
  assert.equal((await kick(adm, cid, owner)).json().error, 'forbidden');
  assert.equal((await setRole(adm, cid, mem, 'admin')).json().error, 'forbidden');
  assert.equal((await setRole(adm, cid, adm2, 'member')).json().error, 'forbidden');
  assert.equal((await setRole(adm, cid, owner, 'member')).json().error, 'forbidden');
  assert.equal((await call(t, adm, 'DELETE', `${GP}/${cid}`)).json().error, 'forbidden');
  assert.equal((await roleOf(cid, owner)).role, 'owner');
  assert.equal((await roleOf(cid, adm2)).role, 'admin');
  assert.equal((await kick(adm, cid, mem2)).statusCode, 204);

  // chủ: không đổi vai trò chính mình, không đặt "owner" qua route đổi vai trò, xóa được quản trị
  assert.equal((await setRole(owner, cid, owner, 'member')).statusCode, 400);
  assert.equal((await call(t, owner, 'PUT', `${GP}/${cid}/members/${mem.userId}/role`, { role: 'owner' })).statusCode, 400);
  assert.equal((await kick(owner, cid, owner)).statusCode, 400, 'tự xóa mình phải dùng leave');
  assert.equal((await kick(owner, cid, adm2)).statusCode, 204);
  assert.equal((await kick(owner, cid, mem2)).statusCode, 404, 'đã không còn trong nhóm');
  assert.equal((await call(t, owner, 'GET', `/v1/chat/conversations/${cid}`)).json().title, 'Tên mới');
});

test('Thêm thành viên: chỉ BẠN của người thêm, dưới 18/chặn bị từ chối cả đợt, người đã ở trong nhóm thì bỏ qua', async () => {
  const { owner, ms, cid } = await group('a1', 1);
  const [good, notFriend, minor, blocked] = await people('a1-', 4);
  await befriend(t, owner, good);
  await befriend(t, owner, minor);
  await befriend(t, owner, blocked);
  const db = await t.dbp.get();
  await db.insert(schema.userBlocks).values({ blockerId: blocked.userId, blockedId: owner.userId });
  t.gate.set(minor.userId, 'minor');
  const before = await activeCount(cid);
  for (const bad of [notFriend, minor, blocked]) {
    const r = await add(owner, cid, [good, bad]);
    assert.equal(r.statusCode, 404);
    assert.equal(r.json().error, 'peer_unavailable');
  }
  assert.equal(await activeCount(cid), before, 'cả đợt bị từ chối, "good" cũng không vào');
  // một thành viên (là bạn của mình, nhưng không phải bạn của chủ) KHÔNG được chủ thêm hộ; thành viên thường cũng không thêm được
  assert.equal((await add(ms[0], cid, [good])).statusCode, 403);
  assert.equal((await add(owner, cid, [good])).statusCode, 204);
  assert.equal((await add(owner, cid, [good, ms[0]])).statusCode, 204, 'idempotent');
  assert.equal(await activeCount(cid), before + 1);
  assert.equal((await add(owner, cid, [owner])).statusCode, 400);
  const sysAdds = (await msgs(owner, cid)).messages.filter((m) => m.system?.type === 'member_added');
  assert.equal(sysAdds.length, 1, 'chỉ một tin "được thêm" (không nhân đôi khi gọi lặp)');
  t.gate.set(minor.userId, null);
});

test('Rời nhóm: chủ rời → người kế vị (chỉ định, hoặc quản trị rồi thành viên cũ nhất); người cuối rời → xóa nhóm', async () => {
  // chỉ định
  let g = await group('l1', 3);
  assert.equal((await call(t, g.ms[0], 'POST', `${GP}/${g.cid}/leave`, { successorId: g.ms[1].userId })).statusCode, 400, 'thành viên thường không chỉ định người kế vị');
  assert.equal((await call(t, g.owner, 'POST', `${GP}/${g.cid}/leave`, { successorId: randomUUID() })).statusCode, 404);
  assert.equal((await call(t, g.owner, 'POST', `${GP}/${g.cid}/leave`, { successorId: g.ms[2].userId })).statusCode, 204);
  assert.equal((await roleOf(g.cid, g.ms[2])).role, 'owner');
  assert.equal((await roleOf(g.cid, g.owner)).leftAt !== null, true);
  assert.equal((await call(t, g.owner, 'GET', `/v1/chat/conversations/${g.cid}`)).statusCode, 403);
  // tự chọn: quản trị trước
  g = await group('l2', 3);
  assert.equal((await setRole(g.owner, g.cid, g.ms[2], 'admin')).statusCode, 204);
  assert.equal((await call(t, g.owner, 'POST', `${GP}/${g.cid}/leave`)).statusCode, 204);
  assert.equal((await roleOf(g.cid, g.ms[2])).role, 'owner', 'quản trị được ưu tiên');
  // tự chọn: không có quản trị → thành viên vào sớm nhất
  g = await group('l3', 2);
  const db = await t.dbp.get();
  await db.update(schema.conversationMembers).set({ joinedAt: new Date(Date.now() - 86_400_000) }).where(and(eq(schema.conversationMembers.conversationId, g.cid), eq(schema.conversationMembers.userId, g.ms[1].userId)));
  assert.equal((await call(t, g.owner, 'POST', `${GP}/${g.cid}/leave`)).statusCode, 204);
  assert.equal((await roleOf(g.cid, g.ms[1])).role, 'owner');
  // luôn đúng MỘT chủ đang ở trong nhóm
  const owners = (await db.select().from(schema.conversationMembers).where(and(eq(schema.conversationMembers.conversationId, g.cid), isNull(schema.conversationMembers.leftAt), eq(schema.conversationMembers.role, 'owner')))).length;
  assert.equal(owners, 1);
  // người cuối rời → xóa nhóm (kèm thành viên + tin)
  assert.equal((await call(t, g.ms[0], 'POST', `${GP}/${g.cid}/leave`)).statusCode, 204);
  assert.equal((await call(t, g.ms[1], 'POST', `${GP}/${g.cid}/leave`)).statusCode, 204);
  assert.equal((await db.select().from(schema.conversations).where(eq(schema.conversations.id, g.cid))).length, 0);
  assert.equal((await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.conversationId, g.cid))).length, 0);
  assert.equal((await call(t, g.ms[1], 'POST', `${GP}/${g.cid}/leave`)).statusCode, 403, 'rời lần hai: không còn ở trong nhóm');
});

test('Chuyển quyền chủ + giải tán: chỉ chủ; chủ cũ thành quản trị; giải tán xóa sạch', async () => {
  const g = await group('o1', 2);
  const db = await t.dbp.get();
  const { transferOwner } = await import('../dist/services/chat/groups.js');
  await assert.rejects(() => transferOwner(db, t.bus, g.ms[0].userId, g.cid, g.ms[1].userId), (e) => e.code === 'forbidden');
  await transferOwner(db, t.bus, g.owner.userId, g.cid, g.ms[0].userId);
  assert.equal((await roleOf(g.cid, g.ms[0])).role, 'owner');
  assert.equal((await roleOf(g.cid, g.owner)).role, 'admin');
  assert.equal((await call(t, g.owner, 'DELETE', `${GP}/${g.cid}`)).json().error, 'forbidden');
  t.bus.clear();
  assert.equal((await call(t, g.ms[0], 'DELETE', `${GP}/${g.cid}`)).statusCode, 204);
  assert.equal((await db.select().from(schema.conversations).where(eq(schema.conversations.id, g.cid))).length, 0);
  for (const u of [g.owner, ...g.ms]) assert.ok(t.bus.framesFor(u.userId).some((f) => f.t === 'member' && f.change === 'removed'));
});

test('Tin hệ thống đủ cho mọi thay đổi, KHÔNG chứa chữ tiếng nào (chỉ system_event)', async () => {
  const { owner, ms, cid } = await group('s1', 2);
  const extra = await person(t, 's1-extra');
  await befriend(t, owner, extra);
  await add(owner, cid, [extra]);
  await call(t, owner, 'PUT', `${GP}/${cid}/title`, { title: 'Tên khác' });
  await kick(owner, cid, ms[0]);
  await call(t, ms[1], 'POST', `${GP}/${cid}/leave`);
  const db = await t.dbp.get();
  const rows = await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.conversationId, cid));
  assert.deepEqual(rows.map((r) => r.systemEvent.type), ['group_created', 'member_added', 'title_changed', 'member_removed', 'member_left']);
  for (const r of rows) {
    assert.equal(r.kind, 'system');
    assert.equal(r.body, null);
    assert.equal(r.senderId, null);
    assert.equal(r.attachmentId, null);
  }
  assert.deepEqual(
    rows.map((r) => r.seq),
    [1, 2, 3, 4, 5],
    'seq liên tục'
  );
  assert.equal(rows[2].systemEvent.title, 'Tên khác');
});

test('IDOR: người ngoài nhóm không đọc/ghi được bất kỳ route nhóm nào; id cuộc 1-1 không dùng được như nhóm', async () => {
  const { owner, ms, cid } = await group('i1', 2);
  const intruder = await person(t, 'i1-intruder');
  await befriend(t, owner, intruder);
  const snapshotMembers = await activeCount(cid);
  const calls = [
    ['GET', `${GP}/${cid}/members`],
    ['POST', `${GP}/${cid}/members`, { memberIds: [randomUUID()] }],
    ['DELETE', `${GP}/${cid}/members/${ms[0].userId}`],
    ['PUT', `${GP}/${cid}/members/${ms[0].userId}/role`, { role: 'admin' }],
    ['POST', `${GP}/${cid}/leave`, {}],
    ['PUT', `${GP}/${cid}/title`, { title: 'bị chiếm' }],
    ['DELETE', `${GP}/${cid}`],
    ['GET', `${GP}/${cid}/readers?seq=1`],
    ['GET', `/v1/chat/conversations/${cid}/messages`],
    ['POST', `/v1/chat/conversations/${cid}/messages`, { clientMsgId: randomUUID(), kind: 'text', body: 'chen ngang' }],
    ['POST', `/v1/chat/conversations/${cid}/read`, { seq: 1 }]
  ];
  for (const [m, url, body] of calls) {
    const r = await call(t, intruder, m, url, body);
    assert.equal(r.statusCode, 403, `${m} ${url} → ${r.statusCode} ${r.body}`);
    assert.equal(r.json().error, 'not_a_member');
  }
  assert.equal((await call(t, intruder, 'GET', `${GP}/${randomUUID()}/members`)).json().error, 'not_a_member', 'id không tồn tại ≡ không ở trong');
  assert.equal(await activeCount(cid), snapshotMembers);
  assert.equal((await call(t, owner, 'GET', `/v1/chat/conversations/${cid}`)).json().title, 'Nhóm i1');
  // cuộc 1-1: thành viên của nó gọi route nhóm → 404, không thay đổi được
  const dmB = await person(t, 'i1-dm');
  const dm = await openDm(t, owner, dmB);
  const r = await call(t, owner, 'POST', `${GP}/${dm}/members`, { memberIds: [intruder.userId] });
  assert.equal(r.statusCode, 404);
  assert.equal(r.json().error, 'conversation_not_found');
  assert.equal((await call(t, owner, 'DELETE', `${GP}/${dm}`)).json().error, 'conversation_not_found');
});

test('Đua: hai yêu cầu thêm cùng một người → một thành viên; thêm và xóa cùng lúc; hai người cùng rời; tất cả nhất quán', async () => {
  const { owner, ms, cid } = await group('r1', 3);
  const x = await person(t, 'r1-x');
  await befriend(t, owner, x);
  const adds = await Promise.all([add(owner, cid, [x]), add(owner, cid, [x]), add(owner, cid, [x])]);
  assert.ok(adds.every((r) => r.statusCode === 204), adds.map((r) => r.body).join('|'));
  const db = await t.dbp.get();
  assert.equal((await db.select().from(schema.conversationMembers).where(and(eq(schema.conversationMembers.conversationId, cid), eq(schema.conversationMembers.userId, x.userId)))).length, 1);
  assert.equal((await msgs(owner, cid)).messages.filter((m) => m.system?.type === 'member_added').length, 1);
  // xóa song song cùng một người: một thắng, còn lại 404
  const kicks = await Promise.all([kick(owner, cid, x), kick(owner, cid, x)]);
  assert.deepEqual(kicks.map((r) => r.statusCode).sort(), [204, 404]);
  // người bị xóa vừa vặn cũng rời: không hỏng dữ liệu, không hai chủ
  const mix = await Promise.all([kick(owner, cid, ms[0]), call(t, ms[0], 'POST', `${GP}/${cid}/leave`)]);
  assert.ok(mix.some((r) => r.statusCode === 204));
  assert.equal((await roleOf(cid, ms[0])).leftAt !== null, true);
  // chủ và thành viên duy nhất còn lại... hai quản trị cùng rời
  await setRole(owner, cid, ms[1], 'admin');
  await setRole(owner, cid, ms[2], 'admin');
  const leaves = await Promise.all([call(t, ms[1], 'POST', `${GP}/${cid}/leave`), call(t, ms[2], 'POST', `${GP}/${cid}/leave`), call(t, owner, 'POST', `${GP}/${cid}/leave`)]);
  assert.ok(leaves.every((r) => r.statusCode === 204 || r.statusCode === 403), leaves.map((r) => r.statusCode).join(','));
  const still = await db.select().from(schema.conversationMembers).where(and(eq(schema.conversationMembers.conversationId, cid), isNull(schema.conversationMembers.leftAt)));
  if (still.length) assert.equal(still.filter((m) => m.role === 'owner').length, 1, 'còn người thì đúng một chủ');
});

test('Trần mềm GROUP_SOFT_CAP: vượt → group_full (409) và không thêm ai, kể cả hai yêu cầu cùng lúc', async () => {
  const small = await chatApp({ GROUP_SOFT_CAP: '5' });
  try {
    const sp = (n) => person(small, n);
    const owner = await sp('cap-chu');
    const ms = await Promise.all([0, 1].map((i) => sp(`cap-m${i}`)));
    for (const m of ms) await befriend(small, owner, m);
    const mk = await call(small, owner, 'POST', '/v1/chat/conversations', { title: 'Nhỏ', memberIds: ms.map((m) => m.userId) });
    assert.equal(mk.statusCode, 200);
    const cid = mk.json().id;
    const extra = await Promise.all([0, 1, 2, 3].map((i) => sp(`cap-e${i}`)));
    for (const e of extra) await befriend(small, owner, e);
    const ad = (ids) => call(small, owner, 'POST', `${GP}/${cid}/members`, { memberIds: ids.map((e) => e.userId) });
    const over = await ad([extra[0], extra[1], extra[2]]);
    assert.equal(over.statusCode, 409);
    assert.equal(over.json().error, 'group_full');
    const race = await Promise.all([ad([extra[0], extra[1]]), ad([extra[2], extra[3]])]);
    assert.deepEqual(race.map((r) => r.statusCode).sort(), [204, 409]);
    const db = await small.dbp.get();
    const n = (await db.select().from(schema.conversationMembers).where(and(eq(schema.conversationMembers.conversationId, cid), isNull(schema.conversationMembers.leftAt)))).length;
    assert.equal(n, 5);
    // tạo nhóm vượt trần ngay từ đầu
    const six = await Promise.all([0, 1, 2, 3, 4].map((i) => sp(`cap-s${i}`)));
    for (const s of six) await befriend(small, owner, s);
    const r = await call(small, owner, 'POST', '/v1/chat/conversations', { title: 'Quá', memberIds: six.map((s) => s.userId) });
    assert.equal(r.json().error, 'group_full');
  } finally {
    await small.close();
  }
});

test('Nhóm 1.000 người: một tin = MỘT dòng chat_messages; thành viên thứ 1.001 bị từ chối (group_full); gửi dưới ngưỡng thời gian', async () => {
  const db = await t.dbp.get();
  const owner = await person(t, 'big-chu');
  const friends = await people('big-f', 2);
  for (const f of friends) await befriend(t, owner, f);
  const [conv] = await db.insert(schema.conversations).values({ kind: 'group', title: 'Lớn', createdBy: owner.userId }).returning({ id: schema.conversations.id });
  const cid = conv.id;
  // 998 người giả (khách trong DB) + chủ = 999 thành viên
  const filler = Array.from({ length: 998 }, () => randomUUID());
  await db.insert(schema.users).values(filler.map((id) => ({ id })));
  await db.insert(schema.socialProfiles).values(filler.map((id, i) => ({ userId: id, displayName: `Đông ${i}` })));
  await db.insert(schema.conversationMembers).values([
    { conversationId: cid, userId: owner.userId, role: 'owner' },
    ...filler.map((id) => ({ conversationId: cid, userId: id, role: 'member', mutedUntil: new Date('9999-12-31') }))
  ]);
  assert.equal(await activeCount(cid), 999);
  assert.equal((await add(owner, cid, [friends[0]])).statusCode, 204, 'thành viên thứ 1.000 vào được');
  assert.equal((await add(owner, cid, [friends[1]])).json().error, 'group_full', 'thứ 1.001 bị từ chối');
  assert.equal(await activeCount(cid), 1000);

  const before = (await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.conversationId, cid))).length;
  t.bus.clear();
  const t0 = performance.now();
  const r = await sendHttp(t, owner, cid, 'chào cả nhóm');
  const ms = performance.now() - t0;
  assert.equal(r.statusCode, 200, r.body);
  assert.equal((await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.conversationId, cid))).length, before + 1, 'MỘT dòng cho 1.000 người');
  const pub = t.bus.published.find((p) => p.frame.t === 'msg' && p.frame.message.cid === cid && p.userIds.length > 1);
  assert.ok(pub && pub.userIds.length === 999, 'khung đẩy tới mọi người khác trong MỘT lần publish');
  console.log(`# sendMessage vào nhóm 1.000 người: ${ms.toFixed(0)} ms (PGlite, gồm HTTP inject)`);
  assert.ok(ms < 1500, `quá chậm: ${ms} ms`); // ngưỡng rộng cho máy dùng chung; số thực ghi ở nhật ký
  // người cuối cùng cũng đọc được qua REST, chưa đọc = 1 (last_read_seq theo thành viên)
  const unread = await db.select().from(schema.conversationMembers).where(and(eq(schema.conversationMembers.conversationId, cid), eq(schema.conversationMembers.userId, filler[0])));
  assert.equal(unread[0].lastReadSeq, 0);
});

test('Nhóm > 50: `read` từng người KHÔNG phát; "đã xem bởi N" tải lười và phân trang; đối xứng với show_read_receipts', async () => {
  const db = await t.dbp.get();
  const owner = await person(t, 'rd-chu');
  const reader = await person(t, 'rd-doc');
  const [conv] = await db.insert(schema.conversations).values({ kind: 'group', title: 'Đã xem', createdBy: owner.userId }).returning({ id: schema.conversations.id });
  const cid = conv.id;
  const filler = Array.from({ length: 60 }, () => randomUUID());
  await db.insert(schema.users).values(filler.map((id) => ({ id })));
  await db.insert(schema.socialProfiles).values(filler.map((id, i) => ({ userId: id, displayName: `Đọc ${i}` })));
  await db.insert(schema.conversationMembers).values([
    { conversationId: cid, userId: owner.userId, role: 'owner' },
    { conversationId: cid, userId: reader.userId, role: 'member' },
    ...filler.map((id, i) => ({ conversationId: cid, userId: id, role: 'member', lastReadSeq: 0, joinedSeq: 0 }))
  ]);
  const sent = await sendHttp(t, owner, cid, 'ai xem rồi?');
  const seq = sent.json().seq;
  // 25 người đã đọc tới seq (đặt thẳng DB), một người tắt đã xem
  const readers = filler.slice(0, 25);
  for (const id of readers) await db.update(schema.conversationMembers).set({ lastReadSeq: seq }).where(and(eq(schema.conversationMembers.conversationId, cid), eq(schema.conversationMembers.userId, id)));
  await db.update(schema.socialProfiles).set({ showReadReceipts: false }).where(eq(schema.socialProfiles.userId, readers[0]));
  t.bus.clear();
  assert.equal((await call(t, reader, 'POST', `/v1/chat/conversations/${cid}/read`, { seq })).statusCode, 204);
  assert.ok(!t.bus.published.some((p) => p.frame.t === 'read'), 'nhóm > 50: không phát read từng người');
  const p1 = (await call(t, owner, 'GET', `${GP}/${cid}/readers?seq=${seq}&limit=10`)).json();
  assert.equal(p1.count, 25, '24 người bật + người vừa đọc (reader) = 25; người tắt không tính');
  assert.equal(p1.readers.length, 10);
  assert.ok(p1.nextCursor);
  const seen = new Set(p1.readers.map((r) => r.id));
  let cur = p1.nextCursor;
  while (cur) {
    const p = (await call(t, owner, 'GET', `${GP}/${cid}/readers?seq=${seq}&limit=10&cursor=${cur}`)).json();
    for (const r of p.readers) seen.add(r.id);
    cur = p.nextCursor;
  }
  assert.equal(seen.size, 25);
  assert.ok(!seen.has(readers[0]) && !seen.has(owner.userId));
  assert.equal((await call(t, owner, 'GET', `${GP}/${cid}/readers?seq=${seq}&cursor=hong`)).statusCode, 400);
  // người xem tắt "đã xem" của mình thì không thấy của người khác
  await db.update(schema.socialProfiles).set({ showReadReceipts: false }).where(eq(schema.socialProfiles.userId, owner.userId));
  assert.equal((await call(t, owner, 'GET', `${GP}/${cid}/readers?seq=${seq}`)).json().count, 0);
  // danh sách thành viên phân trang theo joined_at
  const m1 = (await call(t, owner, 'GET', `${GP}/${cid}/members?limit=50`)).json();
  assert.equal(m1.members.length, 50);
  assert.ok(m1.nextCursor);
  const m2 = (await call(t, owner, 'GET', `${GP}/${cid}/members?limit=50&cursor=${m1.nextCursor}`)).json();
  assert.equal(m1.members.length + m2.members.length, 62);
  assert.equal(new Set([...m1.members, ...m2.members].map((m) => m.id)).size, 62);
});

test('Nhóm ≤ 50 vẫn phát read từng người (chỉ nhóm lớn mới tắt)', async () => {
  const { owner, ms, cid } = await group('rs', 2);
  const s = await sendHttp(t, owner, cid, 'xin chào');
  t.bus.clear();
  await call(t, ms[0], 'POST', `/v1/chat/conversations/${cid}/read`, { seq: s.json().seq });
  assert.ok(t.bus.published.some((p) => p.frame.t === 'read' && p.frame.userId === ms[0].userId));
});

test('Nhóm đạt 200 thành viên: thông báo đẩy tắt sẵn (chỉ lưu cờ); người dùng bật lại thì lần thêm sau không tắt lại', async () => {
  const db = await t.dbp.get();
  const owner = await person(t, 'm2-chu');
  const [a, b] = await people('m2-', 2);
  await befriend(t, owner, a);
  await befriend(t, owner, b);
  const [conv] = await db.insert(schema.conversations).values({ kind: 'group', title: '200', createdBy: owner.userId }).returning({ id: schema.conversations.id });
  const cid = conv.id;
  const filler = Array.from({ length: 197 }, () => randomUUID()); // + chủ = 198
  await db.insert(schema.users).values(filler.map((id) => ({ id })));
  await db.insert(schema.socialProfiles).values(filler.map((id, i) => ({ userId: id, displayName: `M ${i}` })));
  await db.insert(schema.conversationMembers).values([{ conversationId: cid, userId: owner.userId, role: 'owner' }, ...filler.map((id) => ({ conversationId: cid, userId: id, role: 'member' }))]);
  assert.equal((await add(owner, cid, [a])).statusCode, 204); // 199: chưa tắt
  assert.equal((await roleOf(cid, a)).mutedUntil, null);
  assert.equal((await add(owner, cid, [b])).statusCode, 204); // 200: chạm ngưỡng
  const muted = await db.select().from(schema.conversationMembers).where(and(eq(schema.conversationMembers.conversationId, cid), isNull(schema.conversationMembers.leftAt), isNull(schema.conversationMembers.mutedUntil)));
  assert.equal(muted.length, 0, 'mọi thành viên đã được tắt sẵn');
  const view = (await call(t, a, 'GET', `/v1/chat/conversations/${cid}`)).json();
  assert.equal(view.muted, true);
  // a bật lại; thêm người thứ 201 → a vẫn bật, người mới được tắt sẵn
  assert.equal((await call(t, a, 'PUT', `/v1/chat/conversations/${cid}/mute`, { mutedUntil: null })).statusCode, 204);
  const c = await person(t, 'm2-c');
  await befriend(t, owner, c);
  assert.equal((await add(owner, cid, [c])).statusCode, 204);
  assert.equal((await roleOf(cid, a)).mutedUntil, null);
  assert.ok((await roleOf(cid, c)).mutedUntil, 'người mới ở nhóm lớn: tắt sẵn');
});

test('Chặn qua lại giữa thành viên trong nhóm: vẫn ở trong nhóm; tin của người bị chặn hiện cờ blocked (không nội dung) cho người chặn, và không đẩy khung', async () => {
  const { owner, ms, cid } = await group('b1', 2);
  const [blocker, noisy] = ms;
  const db = await t.dbp.get();
  await db.insert(schema.userBlocks).values({ blockerId: blocker.userId, blockedId: noisy.userId });
  t.bus.clear();
  const s = await sendHttp(t, noisy, cid, 'tin của người bị chặn');
  assert.equal(s.statusCode, 200);
  assert.ok(!t.bus.framesFor(blocker.userId).some((f) => f.t === 'msg'), 'người chặn không nhận khung');
  assert.ok(t.bus.framesFor(owner.userId).some((f) => f.t === 'msg'));
  const seenByBlocker = (await msgs(blocker, cid)).messages.find((m) => m.seq === s.json().seq);
  assert.equal(seenByBlocker.blocked, true);
  assert.equal(seenByBlocker.body, undefined);
  assert.equal(seenByBlocker.sender, undefined);
  const seenByOwner = (await msgs(owner, cid)).messages.find((m) => m.seq === s.json().seq);
  assert.equal(seenByOwner.body, 'tin của người bị chặn');
  // chiều ngược lại: người bị chặn vẫn thấy tin của người chặn, và cả hai vẫn là thành viên
  assert.equal((await sendHttp(t, blocker, cid, 'vẫn nói được')).statusCode, 200);
  assert.equal((await msgs(noisy, cid)).messages.at(-1).body, 'vẫn nói được');
  assert.equal(await activeCount(cid), 3);
});

test('Đổi tên nhóm: phát khung conv/title + tin hệ thống tới mọi thành viên; tên rỗng/quá dài bị từ chối', async () => {
  const { owner, ms, cid } = await group('n1', 1);
  t.bus.clear();
  assert.equal((await call(t, owner, 'PUT', `${GP}/${cid}/title`, { title: '  Tên mới  ' })).statusCode, 204);
  assert.equal((await call(t, ms[0], 'GET', `/v1/chat/conversations/${cid}`)).json().title, 'Tên mới');
  assert.ok(t.bus.framesFor(ms[0].userId).some((f) => f.t === 'conv' && f.change === 'title'));
  assert.ok(t.bus.framesFor(ms[0].userId).some((f) => f.t === 'msg' && f.message.system?.type === 'title_changed'));
  assert.equal((await call(t, owner, 'PUT', `${GP}/${cid}/title`, { title: '   ' })).statusCode, 400);
  assert.equal((await call(t, owner, 'PUT', `${GP}/${cid}/title`, { title: 'x'.repeat(61) })).statusCode, 400);
});

test('Khung member: thêm/xóa/rời/đổi vai trò phát tới thành viên (người bị xóa cũng được báo)', async () => {
  const { owner, ms, cid } = await group('f1', 2);
  const x = await person(t, 'f1-x');
  await befriend(t, owner, x);
  t.bus.clear();
  await add(owner, cid, [x]);
  assert.ok(t.bus.framesFor(ms[0].userId).some((f) => f.t === 'member' && f.userId === x.userId && f.change === 'added'));
  await setRole(owner, cid, ms[0], 'admin');
  assert.ok(t.bus.framesFor(ms[1].userId).some((f) => f.t === 'member' && f.userId === ms[0].userId && f.change === 'role'));
  t.bus.clear();
  await kick(owner, cid, x);
  assert.ok(t.bus.framesFor(x.userId).some((f) => f.t === 'member' && f.change === 'removed'), 'người bị xóa được báo');
  assert.ok(t.bus.framesFor(ms[1].userId).some((f) => f.t === 'member' && f.change === 'removed'));
  t.bus.clear();
  await call(t, ms[1], 'POST', `${GP}/${cid}/leave`);
  assert.ok(t.bus.framesFor(owner.userId).some((f) => f.t === 'member' && f.userId === ms[1].userId && f.change === 'left'));
});

test('Tắt tiếng theo nhóm: thành viên tắt tiếng thì không tính chấm đỏ', async () => {
  const { owner, ms, cid } = await group('mu', 1);
  await sendHttp(t, owner, cid, 'ping');
  assert.equal((await call(t, ms[0], 'GET', '/v1/chat/conversations/unread')).json().total, 1);
  assert.equal((await call(t, ms[0], 'PUT', `/v1/chat/conversations/${cid}/mute`, { mutedUntil: '2999-01-01T00:00:00.000Z' })).statusCode, 204);
  assert.equal((await call(t, ms[0], 'GET', '/v1/chat/conversations/unread')).json().total, 0);
  assert.equal((await call(t, ms[0], 'GET', `/v1/chat/conversations/${cid}`)).json().muted, true);
});

test('Đua: người bị xóa gửi tin cùng lúc → tin (nếu nhận) có seq TRƯỚC tin hệ thống "bị xóa"; không có tin nào của họ sau đó', async () => {
  for (let i = 0; i < 5; i++) {
    const { owner, ms, cid } = await group(`rc${i}`, 1);
    await Promise.all([kick(owner, cid, ms[0]), sendHttp(t, ms[0], cid, `chen ${i}`)]);
    const db = await t.dbp.get();
    const rows = await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.conversationId, cid));
    const removedSeq = rows.find((r) => r.systemEvent?.type === 'member_removed').seq;
    assert.ok(rows.filter((r) => r.senderId === ms[0].userId).every((r) => r.seq < removedSeq));
  }
});
