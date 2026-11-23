/**
 * Kho lịch sử chat của Cu Tít — IndexedDB, CHỈ CHỮ, lưu trên máy, không đồng bộ lên server.
 * Dùng thư viện `idb` (Jake Archibald, giấy phép ISC, ~1 KB) bọc IndexedDB: https://github.com/jakearchibald/idb
 * Subpath riêng `@vietlearning/state/chat-history` — KHÔNG re-export từ index.ts; import lười để bundle đầu không tăng.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export const MAX_CONVERSATIONS = 500;
/** Phiên bản danh sách nhà cung cấp AI đã nêu trong hộp đồng ý (đổi nhà cung cấp ⇒ tăng số, hỏi lại) */
export const AI_PROVIDERS_VERSION = 2;
const TITLE_LEN = 40;

export interface ChatConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  scenarioId?: string;
  summary?: string;
  userTurnsSinceSummary: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'tutor';
  kind: 'text' | 'voice' | 'image';
  /** bản chép lời hoặc chú thích ảnh — không bao giờ lưu ảnh/âm thanh */
  text: string;
  at: string;
  status: 'sent' | 'failed';
}

interface ChatDB extends DBSchema {
  conversations: { key: string; value: ChatConversation; indexes: { byUpdated: string } };
  messages: { key: string; value: ChatMessage; indexes: { byConv: [string, string] } };
}

let dbPromise: Promise<IDBPDatabase<ChatDB>> | null = null;
const db = (): Promise<IDBPDatabase<ChatDB>> => {
  dbPromise ??= openDB<ChatDB>('becutit.chat', 1, {
    upgrade(d) {
      d.createObjectStore('conversations', { keyPath: 'id' }).createIndex('byUpdated', 'updatedAt');
      d.createObjectStore('messages', { keyPath: 'id' }).createIndex('byConv', ['conversationId', 'id']);
    }
  });
  return dbPromise;
};

// id tăng dần theo thời gian (sắp xếp được theo chuỗi) + bộ đếm để không trùng trong cùng mili giây
let seq = 0;
const newId = (prefix: string): string => `${prefix}${Date.now().toString(36).padStart(9, '0')}${(seq++ % 1679616).toString(36).padStart(4, '0')}${Math.random().toString(36).slice(2, 6)}`;

export async function listConversations(): Promise<ChatConversation[]> {
  const d = await db();
  const out: ChatConversation[] = [];
  let cur = await d.transaction('conversations').store.index('byUpdated').openCursor(null, 'prev');
  while (cur) {
    out.push(cur.value);
    cur = await cur.continue();
  }
  return out;
}

export async function createConversation(p: { scenarioId?: string }): Promise<ChatConversation> {
  const d = await db();
  const now = new Date().toISOString();
  const c: ChatConversation = { id: newId('c'), title: '', createdAt: now, updatedAt: now, userTurnsSinceSummary: 0, ...(p.scenarioId ? { scenarioId: p.scenarioId } : {}) };
  const tx = d.transaction(['conversations', 'messages'], 'readwrite');
  await tx.objectStore('conversations').put(c);
  // quá trần ⇒ xóa các cuộc cũ nhất (cùng tin của chúng)
  let extra = (await tx.objectStore('conversations').count()) - MAX_CONVERSATIONS;
  let cur = await tx.objectStore('conversations').index('byUpdated').openCursor();
  while (cur && extra > 0) {
    await deleteMessagesOf(tx.objectStore('messages'), cur.value.id);
    await cur.delete();
    extra--;
    cur = await cur.continue();
  }
  await tx.done;
  return c;
}

async function deleteMessagesOf(store: { index(n: 'byConv'): { openCursor(r: IDBKeyRange): Promise<{ delete(): Promise<void>; continue(): Promise<unknown> } | null> } }, id: string): Promise<void> {
  let cur = await store.index('byConv').openCursor(IDBKeyRange.bound([id, ''], [id, '￿']));
  while (cur) {
    await cur.delete();
    cur = (await cur.continue()) as typeof cur;
  }
}

export async function appendMessage(m: Omit<ChatMessage, 'id' | 'at'>): Promise<ChatMessage> {
  const d = await db();
  const msg: ChatMessage = { ...m, id: newId('m'), at: new Date().toISOString() };
  const tx = d.transaction(['conversations', 'messages'], 'readwrite');
  const convs = tx.objectStore('conversations');
  const c = await convs.get(m.conversationId);
  if (!c) {
    tx.abort();
    await tx.done.catch(() => undefined);
    throw new Error('conversation_not_found');
  }
  await tx.objectStore('messages').put(msg);
  const isUser = m.role === 'user';
  await convs.put({
    ...c,
    updatedAt: msg.at,
    title: !c.title && isUser ? m.text.slice(0, TITLE_LEN) : c.title,
    userTurnsSinceSummary: c.userTurnsSinceSummary + (isUser ? 1 : 0)
  });
  await tx.done;
  return msg;
}

/** N tin cuối của cuộc, theo thứ tự thời gian (cũ → mới) */
export async function recentMessages(conversationId: string, limit: number): Promise<ChatMessage[]> {
  const d = await db();
  const out: ChatMessage[] = [];
  let cur = await d.transaction('messages').store.index('byConv').openCursor(IDBKeyRange.bound([conversationId, ''], [conversationId, '￿']), 'prev');
  while (cur && out.length < limit) {
    out.push(cur.value);
    cur = await cur.continue();
  }
  return out.reverse();
}

async function patch(id: string, f: (c: ChatConversation) => ChatConversation): Promise<void> {
  const d = await db();
  const tx = d.transaction('conversations', 'readwrite');
  const c = await tx.store.get(id);
  if (c) await tx.store.put(f(c));
  await tx.done;
}

export const renameConversation = (id: string, title: string): Promise<void> => patch(id, (c) => ({ ...c, title: title.trim().slice(0, 80) }));

export const setSummary = (id: string, summary: string): Promise<void> => patch(id, (c) => ({ ...c, summary, userTurnsSinceSummary: 0 }));

export async function deleteConversation(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['conversations', 'messages'], 'readwrite');
  await deleteMessagesOf(tx.objectStore('messages'), id);
  await tx.objectStore('conversations').delete(id);
  await tx.done;
}

/** Xóa toàn bộ — gọi khi xóa tài khoản / đăng xuất */
export async function deleteAll(): Promise<void> {
  const d = await db();
  const tx = d.transaction(['conversations', 'messages'], 'readwrite');
  await Promise.all([tx.objectStore('conversations').clear(), tx.objectStore('messages').clear(), tx.done]);
}
