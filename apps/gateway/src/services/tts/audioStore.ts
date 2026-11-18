import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Kho âm thanh dựng sẵn trên đĩa (GĐ2, D9) — “object storage” bản đơn giản cho một instance.
 *   <dir>/<sha256>.wav          tệp âm thanh, tên = khóa cache (TTSCacheProxy.ttsCacheKey)
 *   <dir>/packs/<gói>-<miền>.json  manifest gói (văn bản → khóa), client tải theo unit
 *   <dir>/state/<gói>-<miền>.json  trạng thái script dựng sẵn (ok / rejected / unverified)
 * Ghi tệp qua tệp tạm + rename để không bao giờ phục vụ tệp ghi dở.
 */
export const KEY_RE = /^[a-f0-9]{64}$/;
export const PACK_FILE_RE = /^[\w-]{1,40}-(north|central|south)\.json$/;

export class FileAudioStore {
  constructor(readonly dir: string) {}

  private wavPath(key: string): string {
    if (!KEY_RE.test(key)) throw new Error(`Khóa âm thanh không hợp lệ: ${key}`);
    return join(this.dir, `${key}.wav`);
  }

  async has(key: string): Promise<boolean> {
    try {
      return (await stat(this.wavPath(key))).size > 44;
    } catch {
      return false;
    }
  }

  async read(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.wavPath(key));
    } catch {
      return null;
    }
  }

  async write(key: string, wav: Uint8Array): Promise<void> {
    await this.atomicWrite(this.wavPath(key), wav);
  }

  async readJson<T>(name: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(join(this.dir, name), 'utf8')) as T;
    } catch {
      return null;
    }
  }

  async writeJson(name: string, value: unknown): Promise<void> {
    await this.atomicWrite(join(this.dir, name), JSON.stringify(value, null, 1));
  }

  private async atomicWrite(path: string, data: Uint8Array | string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, path);
  }
}
