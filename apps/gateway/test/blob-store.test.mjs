import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, statSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createBlobStore } from '../dist/services/blob/index.js';

/** Kho tệp `fs` (dự án 5a Task 2): khóa do server sinh, chống path traversal, không để lại tệp dở, giới hạn cỡ. */
const tmp = () => mkdtempSync(join(tmpdir(), 'blob-'));
const files = (dir) => {
  const out = [];
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      statSync(p).isDirectory() ? walk(p) : out.push(p);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
};
const read = async (s) => {
  const c = [];
  for await (const x of s) c.push(x);
  return Buffer.concat(c);
};
const KEY = 'feedback/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png';

test('put → get → totalBytes → delete', async () => {
  const dir = tmp();
  const s = createBlobStore({ BLOB_PROVIDER: 'fs', BLOB_DIR: dir });
  assert.equal(await s.totalBytes(), 0);
  const r = await s.put(KEY, Readable.from([Buffer.from('hello '), Buffer.from('world')]), { contentType: 'image/png', maxBytes: 100 });
  assert.equal(r.bytes, 11);
  assert.equal(await s.totalBytes(), 11);
  const got = await s.get(KEY);
  assert.equal(got.bytes, 11);
  assert.equal(got.contentType, 'image/png');
  assert.equal((await read(got.stream)).toString(), 'hello world');
  const part = await s.get(KEY, { start: 6, end: 8 });
  assert.equal((await read(part.stream)).toString(), 'wor');
  assert.equal(part.bytes, 11); // bytes = cỡ cả tệp
  await s.delete(KEY);
  assert.equal(await s.get(KEY), null);
  assert.equal(await s.totalBytes(), 0);
  await s.delete(KEY); // xóa tệp không có: không ném
  assert.deepEqual(files(dir), []);
  rmSync(dir, { recursive: true, force: true });
});

test('vượt maxBytes: ném lỗi file_too_large (413) và không để lại tệp dở', async () => {
  const dir = tmp();
  const s = createBlobStore({ BLOB_PROVIDER: 'fs', BLOB_DIR: dir });
  await assert.rejects(
    () => s.put(KEY, Readable.from([Buffer.alloc(60), Buffer.alloc(60)]), { contentType: 'image/png', maxBytes: 100 }),
    (e) => e.statusCode === 413 && e.code === 'file_too_large'
  );
  assert.deepEqual(files(dir), []);
  assert.equal(await s.get(KEY), null);
  rmSync(dir, { recursive: true, force: true });
});

test('luồng đứt giữa chừng: không để lại tệp dở, khóa không tồn tại', async () => {
  const dir = tmp();
  const s = createBlobStore({ BLOB_PROVIDER: 'fs', BLOB_DIR: dir });
  async function* broken() {
    yield Buffer.alloc(1000);
    throw new Error('mạng đứt');
  }
  await assert.rejects(() => s.put(KEY, Readable.from(broken()), { contentType: 'image/png', maxBytes: 5000 }), /mạng đứt/);
  assert.deepEqual(files(dir), []);
  assert.equal(await s.get(KEY), null);
  rmSync(dir, { recursive: true, force: true });
});

test('khóa lạ bị từ chối (path traversal, tuyệt đối, ngược gạch chéo, rỗng...)', async () => {
  const dir = tmp();
  const s = createBlobStore({ BLOB_PROVIDER: 'fs', BLOB_DIR: dir });
  const bad = ['../x.png', 'feedback/../../x.png', '/etc/passwd', 'C:\\x.png', 'feedback\\a\\b.png', '', 'feedback//a.png', 'feedback/a/b.exe', 'feedback/a/b', 'feedback/./a.png', 'feedback/a%2e%2e/b.png', 'feedback/a/b.png\0', '.hidden/x.png'];
  for (const k of bad) {
    await assert.rejects(() => s.put(k, Readable.from([Buffer.from('x')]), { contentType: 'image/png', maxBytes: 10 }), /khóa/i, `put ${JSON.stringify(k)}`);
    await assert.rejects(() => s.get(k), /khóa/i, `get ${JSON.stringify(k)}`);
    await assert.rejects(() => s.delete(k), /khóa/i, `delete ${JSON.stringify(k)}`);
  }
  assert.deepEqual(files(dir), []);
  rmSync(dir, { recursive: true, force: true });
});

test('totalBytes cộng đúng các tệp có sẵn trong thư mục', async () => {
  const dir = tmp();
  mkdirSync(join(dir, 'feedback', 'a'), { recursive: true });
  writeFileSync(join(dir, 'feedback', 'a', 'x.png'), Buffer.alloc(1234));
  const s = createBlobStore({ BLOB_PROVIDER: 'fs', BLOB_DIR: dir });
  assert.equal(await s.totalBytes(), 1234);
  rmSync(dir, { recursive: true, force: true });
});

test('BLOB_PROVIDER=r2 chưa làm: báo lỗi rõ ràng', () => {
  assert.throws(() => createBlobStore({ BLOB_PROVIDER: 'r2', BLOB_DIR: '/x' }), /r2/i);
});
