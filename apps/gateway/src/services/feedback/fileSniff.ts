/**
 * Nhận dạng loại tệp theo NỘI DUNG (magic bytes), không tin Content-Type hay tên tệp do client gửi.
 * Chỉ nhận: ảnh WebP/JPEG/PNG; video MP4/WebM/MOV. SVG, PE (.exe), HEIC/AVIF, MKV... => null (từ chối).
 * Tham khảo: đặc tả định dạng (PNG signature, JPEG SOI, RIFF/WEBP, ISO BMFF `ftyp`, EBML DocType) — tự viết.
 */
export interface SniffedMedia {
  media: 'image' | 'video';
  contentType: 'image/webp' | 'image/jpeg' | 'image/png' | 'video/mp4' | 'video/webm' | 'video/quicktime';
}

/** Đủ để thấy `ftyp` và DocType của WebM; route đọc 4100 byte đầu */
export const SNIFF_BYTES = 4100;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Brand `ftyp` của MP4 thông dụng (điện thoại, trình ghi màn hình). KHÔNG gồm brand ảnh (heic, avif, mif1...) và âm thanh (M4A). */
const MP4_BRANDS = new Set(['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'iso7', 'iso8', 'iso9', 'mp41', 'mp42', 'mp71', 'avc1', 'M4V ', 'M4VH', 'M4VP', 'dash', 'MSNV', 'f4v ', '3gp4', '3gp5', '3gp6', '3gp7', '3g2a']);

export function sniffMedia(head: Buffer): SniffedMedia | null {
  if (head.length >= 8 && head.subarray(0, 8).equals(PNG)) return { media: 'image', contentType: 'image/png' };
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { media: 'image', contentType: 'image/jpeg' };
  if (head.length >= 12 && head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP') return { media: 'image', contentType: 'image/webp' };
  if (head.length >= 12 && head.toString('latin1', 4, 8) === 'ftyp') {
    const brand = head.toString('latin1', 8, 12);
    if (brand === 'qt  ') return { media: 'video', contentType: 'video/quicktime' };
    if (MP4_BRANDS.has(brand)) return { media: 'video', contentType: 'video/mp4' };
    return null;
  }
  // WebM = Matroska (EBML) có DocType "webm"; MKV (DocType "matroska") bị từ chối
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    if (head.toString('latin1', 0, Math.min(head.length, 64)).includes('webm')) return { media: 'video', contentType: 'video/webm' };
  }
  return null;
}

const EXT: Record<SniffedMedia['contentType'], string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov'
};
/** Đuôi tệp do SERVER chọn theo loại đã nhận dạng (không lấy từ tên client) */
export const extOf = (t: SniffedMedia['contentType']): string => EXT[t];
