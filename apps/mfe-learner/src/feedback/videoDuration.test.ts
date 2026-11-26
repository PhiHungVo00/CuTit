import { afterEach, describe, expect, it, vi } from 'vitest';
import { readVideoDurationMs } from './videoDuration';

type Fake = { duration: number; src: string; preload: string; onloadedmetadata: (() => void) | null; onerror: (() => void) | null; load: () => void };
function stubVideo(fire: (v: Fake) => void) {
  const v: Fake = { duration: NaN, src: '', preload: '', onloadedmetadata: null, onerror: null, load: () => queueMicrotask(() => fire(v)) };
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => (tag === 'video' ? v : Document.prototype.createElement.call(document, tag))) as typeof document.createElement);
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  return v;
}
afterEach(() => vi.restoreAllMocks());

describe('readVideoDurationMs', () => {
  it('đọc duration (giây) => mili giây, và giải phóng URL tạm', async () => {
    stubVideo((v) => {
      v.duration = 24.5;
      v.onloadedmetadata?.();
    });
    expect(await readVideoDurationMs(new File(['x'], 'a.mp4', { type: 'video/mp4' }))).toBe(24500);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });
  it('không đọc được => ném lỗi', async () => {
    stubVideo((v) => v.onerror?.());
    await expect(readVideoDurationMs(new File(['x'], 'a.mp4', { type: 'video/mp4' }))).rejects.toThrow();
  });
});
