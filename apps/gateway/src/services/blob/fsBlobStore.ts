import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rmdir, stat, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BlobKeyError, BlobTooLargeError, type BlobStore } from './BlobStore.js';

/**
 * Kho tệp trên đĩa (dev/test; `BLOB_DIR`, mặc định ngoài repo). Tham khảo: mẫu "ghi vào tệp tạm cùng ổ đĩa rồi rename
 * nguyên tử" là kỹ thuật chuẩn (không chép mã ngoài).
 *
 * An toàn:
 * - Khóa chỉ gồm các đoạn `[A-Za-z0-9_-]` ngăn bằng `/`, đoạn cuối có đuôi trong danh sách => không `..`, không tuyệt đối,
 *   không `\`, không byte rỗng; sau đó còn kiểm đường dẫn đã resolve nằm TRONG thư mục gốc (hai lớp).
 * - Ghi vào `.tmp/<uuid>` rồi rename: người đọc không bao giờ thấy tệp dở; lỗi/đứt luồng/quá cỡ thì xóa tệp tạm.
 */
const EXT_TYPES: Record<string, string> = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime'
};
const SEGMENT = /^[A-Za-z0-9_-]{1,80}$/;
const TTL_MS = 60_000;

export class FsBlobStore implements BlobStore {
  private readonly root: string;
  private cache: { value: number; at: number } | null = null;

  constructor(dir: string) {
    this.root = resolve(dir);
  }

  /** Khóa → đường dẫn tuyệt đối trong thư mục gốc; khóa lạ => BlobKeyError */
  private path(key: string): string {
    const parts = key.split('/');
    const last = parts.pop() ?? '';
    const dot = last.lastIndexOf('.');
    const ext = dot > 0 ? last.slice(dot + 1) : '';
    if (parts.length === 0 || !parts.every((p) => SEGMENT.test(p)) || !SEGMENT.test(last.slice(0, dot > 0 ? dot : 0)) || !(ext in EXT_TYPES)) {
      throw new BlobKeyError(key);
    }
    const abs = resolve(this.root, ...parts, last);
    if (!abs.startsWith(this.root + sep)) throw new BlobKeyError(key);
    return abs;
  }

  async put(key: string, src: Readable, o: { contentType: string; maxBytes: number }): Promise<{ bytes: number }> {
    const dest = this.path(key);
    const tmpDir = join(this.root, '.tmp');
    await mkdir(tmpDir, { recursive: true });
    const tmp = join(tmpDir, randomUUID());
    let bytes = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        bytes += chunk.length;
        if (bytes > o.maxBytes) cb(new BlobTooLargeError(o.maxBytes));
        else cb(null, chunk);
      }
    });
    try {
      await pipeline(src, limiter, createWriteStream(tmp, { flags: 'wx', mode: 0o600 }));
      await mkdir(dirname(dest), { recursive: true });
      await rename(tmp, dest);
    } catch (err) {
      await unlink(tmp).catch(() => undefined);
      throw err;
    }
    if (this.cache) this.cache.value += bytes;
    return { bytes };
  }

  async get(key: string, range?: { start: number; end?: number }) {
    const abs = this.path(key);
    let size: number;
    try {
      size = (await stat(abs)).size;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
    const ext = abs.slice(abs.lastIndexOf('.') + 1);
    const stream = createReadStream(abs, range ? { start: range.start, end: range.end } : undefined);
    return { stream, bytes: size, contentType: EXT_TYPES[ext] ?? 'application/octet-stream' };
  }

  async delete(key: string): Promise<void> {
    const abs = this.path(key);
    let size = 0;
    try {
      size = (await stat(abs)).size;
      await unlink(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
    if (this.cache) this.cache.value = Math.max(0, this.cache.value - size);
    await rmdir(dirname(abs)).catch(() => undefined); // dọn thư mục góp ý rỗng; còn tệp khác thì rmdir tự từ chối
  }

  async sweepTemp(olderThanMs: number, now: Date): Promise<number> {
    const tmpDir = join(this.root, '.tmp');
    let names: string[];
    try {
      names = await readdir(tmpDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0;
      throw err;
    }
    let n = 0;
    for (const name of names) {
      const p = join(tmpDir, name);
      try {
        const st = await stat(p);
        if (st.isFile() && now.getTime() - st.mtimeMs > olderThanMs) {
          await unlink(p);
          n++;
          if (this.cache) this.cache.value = Math.max(0, this.cache.value - st.size);
        }
      } catch {
        /* tệp vừa được rename/xóa bởi lần ghi khác: bỏ qua */
      }
    }
    return n;
  }

  async totalBytes(): Promise<number> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < TTL_MS) return this.cache.value;
    const value = await this.walk(this.root);
    this.cache = { value, at: now };
    return value;
  }

  private async walk(dir: string): Promise<number> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0;
      throw err;
    }
    let total = 0;
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) total += await this.walk(p);
      else if (e.isFile()) {
        // Tệp tạm có thể vừa được rename/xóa bởi lần ghi song song giữa readdir và stat: bỏ qua, không lỗi
        total += await stat(p).then(
          (st) => st.size,
          (err: NodeJS.ErrnoException) => {
            if (err.code === 'ENOENT') return 0;
            throw err;
          }
        );
      }
    }
    return total;
  }
}
