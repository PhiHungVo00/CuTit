import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CONVERSATIONS,
  AI_PROVIDERS_VERSION,
  listConversations,
  createConversation,
  appendMessage,
  recentMessages,
  renameConversation,
  setSummary,
  deleteConversation,
  deleteAll
} from '../dist/chatHistory/index.js';

const msg = (conversationId, text, role = 'user') => ({ conversationId, role, kind: 'text', text, status: 'sent' });

test('hằng số', () => {
  assert.equal(MAX_CONVERSATIONS, 500);
  assert.equal(AI_PROVIDERS_VERSION, 2);
});

test('tạo 501 cuộc ⇒ còn 500, cuộc cũ nhất bị xóa', async () => {
  await deleteAll();
  const first = await createConversation({});
  for (let i = 0; i < 500; i++) await createConversation({});
  const list = await listConversations();
  assert.equal(list.length, 500);
  assert.ok(!list.some((c) => c.id === first.id));
});

test('xóa cuộc cũ nhất cũng xóa tin của nó', async () => {
  await deleteAll();
  const first = await createConversation({});
  await appendMessage(msg(first.id, 'xin chào'));
  for (let i = 0; i < 500; i++) await createConversation({});
  assert.deepEqual(await recentMessages(first.id, 10), []);
});

test('recentMessages trả đúng N tin cuối theo thứ tự thời gian', async () => {
  await deleteAll();
  const c = await createConversation({});
  for (let i = 0; i < 150; i++) await appendMessage(msg(c.id, `t${i}`, i % 2 ? 'tutor' : 'user'));
  const r = await recentMessages(c.id, 10);
  assert.deepEqual(r.map((m) => m.text), Array.from({ length: 10 }, (_, i) => `t${140 + i}`));
});

test('tiêu đề mặc định = 40 ký tự đầu tin người dùng đầu tiên', async () => {
  await deleteAll();
  const c = await createConversation({});
  await appendMessage(msg(c.id, 'Bé chào Cu Tít', 'tutor'));
  assert.equal((await listConversations())[0].title, '');
  const long = 'a'.repeat(60);
  await appendMessage(msg(c.id, long));
  await appendMessage(msg(c.id, 'tin thứ hai'));
  assert.equal((await listConversations())[0].title, 'a'.repeat(40));
});

test('đổi tên không bị tin mới ghi đè', async () => {
  await deleteAll();
  const c = await createConversation({});
  await renameConversation(c.id, 'Tên tôi đặt');
  await appendMessage(msg(c.id, 'tin đầu'));
  assert.equal((await listConversations())[0].title, 'Tên tôi đặt');
});

test('deleteAll ⇒ danh sách rỗng; deleteConversation xóa một cuộc', async () => {
  await deleteAll();
  const a = await createConversation({});
  const b = await createConversation({ scenarioId: 'k1' });
  assert.equal(b.scenarioId, 'k1');
  await deleteConversation(a.id);
  assert.deepEqual((await listConversations()).map((c) => c.id), [b.id]);
  await deleteAll();
  assert.equal((await listConversations()).length, 0);
});

test('userTurnsSinceSummary tăng theo tin user, về 0 khi setSummary', async () => {
  await deleteAll();
  const c = await createConversation({});
  await appendMessage(msg(c.id, 'a'));
  await appendMessage(msg(c.id, 'b', 'tutor'));
  await appendMessage(msg(c.id, 'c'));
  assert.equal((await listConversations())[0].userTurnsSinceSummary, 2);
  await setSummary(c.id, 'tóm tắt');
  const after = (await listConversations())[0];
  assert.equal(after.userTurnsSinceSummary, 0);
  assert.equal(after.summary, 'tóm tắt');
});

test('danh sách: cuộc mới cập nhật nhất trước', async () => {
  await deleteAll();
  const a = await createConversation({});
  await new Promise((r) => setTimeout(r, 5));
  const b = await createConversation({});
  await new Promise((r) => setTimeout(r, 5));
  await appendMessage(msg(a.id, 'mới'));
  assert.deepEqual((await listConversations()).map((c) => c.id), [a.id, b.id]);
});
