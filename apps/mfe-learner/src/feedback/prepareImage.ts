import { FEEDBACK_LIMITS } from '@vietlearning/contracts/api';

/** Cạnh dài tối đa sau khi vẽ lại (spec §5.1) */
export const IMAGE_MAX_EDGE = 1920;
const QUALITY = 0.82;

/**
 * Vẽ lại ảnh qua canvas thành WebP, cạnh dài ≤ 1920 px. Vẽ lại = chỉ còn điểm ảnh ⇒ mất EXIF (vị trí GPS,
 * tên máy ảnh…) và nhẹ hơn. `imageOrientation: 'from-image'` xoay đúng chiều trước khi bỏ EXIF.
 * Trình duyệt không mã hóa được WebP (Safari cũ) vẫn trả ảnh vẽ lại (PNG) — vẫn không có EXIF.
 */
export async function prepareImage(file: File): Promise<Blob> {
  // Trình duyệt/WebView cũ ném lỗi với tham số tùy chọn: thử lại không tham số trước khi bỏ cuộc
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
  try {
    const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas_unavailable');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', QUALITY));
    if (!blob) throw new Error('encode_failed');
    if (blob.size > FEEDBACK_LIMITS.imageBytes) throw new Error('image_too_large');
    return blob;
  } finally {
    bitmap.close?.();
  }
}
