/**
 * Chuẩn bị ảnh trước khi gửi Gateway: thu nhỏ cạnh dài ≤ MAX_SIDE, nén JPEG.
 * Ảnh điện thoại 12MP (~4 MB) => ~60–150 KB: tiết kiệm dữ liệu di động và quota Vision.
 */
export const MAX_SIDE = 640;
const QUALITY = 0.72;

export function fitWithin(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Vẽ nguồn ảnh (video đang chạy hoặc ảnh đã chọn) lên canvas nhỏ rồi xuất JPEG base64 (không tiền tố data:) */
export async function toJpegBase64(source: CanvasImageSource, srcWidth: number, srcHeight: number): Promise<{ base64: string; previewUrl: string }> {
  const { width, height } = fitWithin(srcWidth, srcHeight);
  if (!width) throw new Error('Ảnh rỗng');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Không vẽ được ảnh');
  ctx.drawImage(source, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
  return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), previewUrl: dataUrl };
}

/** Đọc tệp ảnh người dùng chọn thành bitmap (tôn trọng hướng xoay EXIF nếu trình duyệt hỗ trợ) */
export async function fileToJpegBase64(file: File): Promise<{ base64: string; previewUrl: string }> {
  if (!file.type.startsWith('image/')) throw new Error('Tệp không phải ảnh');
  if ('createImageBitmap' in window) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    try {
      return await toJpegBase64(bmp, bmp.width, bmp.height);
    } finally {
      bmp.close();
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return await toJpegBase64(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}
