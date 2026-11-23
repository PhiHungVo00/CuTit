import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { readApkRelease } from '../src/apk';

const dir = mkdtempSync(join(tmpdir(), 'landing-apk-'));
const full = { version: '1.0.0', url: '/BeCuTit-1.0.0.apk', bytes: 12345678, sha256: 'a'.repeat(64), minAndroid: '8.0' };
const write = (name: string, text: string) => {
  const p = join(dir, name);
  writeFileSync(p, text);
  return p;
};

describe('readApkRelease', () => {
  it('thiếu tệp => null kèm cảnh báo', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(readApkRelease(join(dir, 'khong-co.json'))).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it('JSON hỏng => null', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(readApkRelease(write('hong.json', '{ không phải json'))).toBeNull();
  });
  it('thiếu sha256 => null', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { sha256: _omit, ...thieu } = full;
    expect(readApkRelease(write('thieu.json', JSON.stringify(thieu)))).toBeNull();
  });
  it('sha256 sai định dạng hoặc cỡ tệp không dương => null', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(readApkRelease(write('sha.json', JSON.stringify({ ...full, sha256: 'xyz' })))).toBeNull();
    expect(readApkRelease(write('bytes.json', JSON.stringify({ ...full, bytes: 0 })))).toBeNull();
  });
  it('đủ trường => trả object', () => {
    expect(readApkRelease(write('du.json', JSON.stringify(full)))).toEqual(full);
  });
});
