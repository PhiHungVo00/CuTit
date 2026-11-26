import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareImage } from './prepareImage';

/** jsdom không có canvas thật: giả createImageBitmap + canvas để kiểm LOGIC (kích thước, loại tệp, không mang theo byte gốc). */
function stubCanvas(width: number, height: number, outType = 'image/webp') {
  const draw = vi.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: draw }),
    toBlob: (cb: (b: Blob | null) => void, type: string, q: number) => {
      // Bản vẽ lại chỉ chứa điểm ảnh: KHÔNG chứa đoạn EXIF của tệp gốc
      expect(type).toBe('image/webp');
      expect(q).toBeGreaterThan(0.5);
      cb(new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50])], { type: outType }));
    }
  };
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width, height, close: vi.fn() })));
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => (tag === 'canvas' ? canvas : Document.prototype.createElement.call(document, tag))) as typeof document.createElement);
  return { canvas, draw };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// JPEG giả có APP1 "Exif" + toạ độ GPS (chỉ cần chuỗi để chứng minh đầu ra không còn)
const exifJpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 20, ...new TextEncoder().encode('Exif\0\0GPSLatitude'), 0xff, 0xd9])], 'a.jpg', { type: 'image/jpeg' });

describe('prepareImage', () => {
  it('JPEG có EXIF GPS => ra image/webp, không còn chuỗi Exif', async () => {
    stubCanvas(800, 600);
    const out = await prepareImage(exifJpeg());
    expect(out.type).toBe('image/webp');
    const text = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsText(out, 'latin1');
    });
    expect(text).not.toContain('Exif');
    expect(text).not.toContain('GPS');
  });

  it('ảnh 4000×3000 => cạnh dài 1920 (giữ tỉ lệ)', async () => {
    const { canvas } = stubCanvas(4000, 3000);
    await prepareImage(exifJpeg());
    expect([canvas.width, canvas.height]).toEqual([1920, 1440]);
  });

  it('ảnh dọc 1000×3000 => cạnh dài 1920; ảnh nhỏ không phóng to', async () => {
    const a = stubCanvas(1000, 3000);
    await prepareImage(exifJpeg());
    expect([a.canvas.width, a.canvas.height]).toEqual([640, 1920]);
    vi.restoreAllMocks();
    const b = stubCanvas(300, 200);
    await prepareImage(exifJpeg());
    expect([b.canvas.width, b.canvas.height]).toEqual([300, 200]);
  });

  it('không giải mã được ảnh => ném lỗi để màn hình báo "không đọc được ảnh"', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new Error('bad'))));
    await expect(prepareImage(exifJpeg())).rejects.toThrow();
  });
});
