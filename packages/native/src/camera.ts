/**
 * Chụp / chọn ảnh dùng chung cho chat (📷) và gọi video (📹), web + Capacitor Android.
 *
 * Không thêm plugin Capacitor: WebView Android đã chạy getUserMedia (quyền CAMERA có trong Manifest,
 * Capacitor xin lúc dùng) và <input type=file capture> — cùng đường với màn camera M4 cũ. Thêm
 * @capacitor/camera chỉ tốn gói đầu + quyền mà không có năng lực mới.
 */

/** Cạnh dài tối đa của ảnh gửi Gateway */
export const MAX_SIDE = 768;
/** Giới hạn base64 (ký tự) ≈ 150 KB nhị phân */
export const MAX_BASE64_CHARS = 204_800;
const START_QUALITY = 0.8;
const MIN_QUALITY = 0.5;
const QUALITY_STEP = 0.1;

export type CameraErrorCode = 'permission-denied' | 'no-camera' | 'unsupported' | 'failed';

export class CameraError extends Error {
  readonly code: CameraErrorCode;
  constructor(code: CameraErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'CameraError';
    this.code = code;
  }
}

export interface CapturedImage {
  /** JPEG base64, không tiền tố data: */
  base64: string;
  previewUrl: string;
}

/** Đổi lỗi trình duyệt (DOMException) sang CameraError chuẩn */
export function toCameraError(err: unknown): CameraError {
  if (err instanceof CameraError) return err;
  const name = (err as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return new CameraError('permission-denied');
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return new CameraError('no-camera');
  return new CameraError('failed', (err as Error | null)?.message);
}

export function fitWithin(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Mã hóa với chất lượng giảm dần tới khi base64 ≤ giới hạn (tối thiểu q=0.5).
 * Vẫn quá lớn ở q tối thiểu ⇒ trả bản nhỏ nhất đó (Gateway sẽ từ chối rõ ràng).
 * `encode(q)` trả data URL.
 */
export function encodeUnderLimit(encode: (quality: number) => string, maxChars = MAX_BASE64_CHARS): CapturedImage {
  let q = START_QUALITY;
  let dataUrl = encode(q);
  while (dataUrl.length - dataUrl.indexOf(',') - 1 > maxChars && q > MIN_QUALITY + 1e-9) {
    q = Math.max(MIN_QUALITY, Math.round((q - QUALITY_STEP) * 100) / 100);
    dataUrl = encode(q);
  }
  return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), previewUrl: dataUrl };
}

/** Vẽ nguồn ảnh (video đang chạy hoặc ảnh đã chọn) lên canvas nhỏ rồi xuất JPEG */
export async function toJpegBase64(source: CanvasImageSource, srcWidth: number, srcHeight: number): Promise<CapturedImage> {
  if (typeof document === 'undefined') throw new CameraError('unsupported');
  const { width, height } = fitWithin(srcWidth, srcHeight);
  if (!width) throw new CameraError('failed', 'Ảnh rỗng');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new CameraError('failed', 'Không vẽ được ảnh');
  ctx.drawImage(source, 0, 0, width, height);
  return encodeUnderLimit((q) => canvas.toDataURL('image/jpeg', q));
}

/** Tệp ảnh người dùng chọn ⇒ JPEG nhỏ (tôn trọng hướng xoay EXIF nếu trình duyệt hỗ trợ) */
export async function fileToJpegBase64(file: File): Promise<CapturedImage> {
  if (!file.type.startsWith('image/')) throw new CameraError('failed', 'Tệp không phải ảnh');
  if (typeof createImageBitmap === 'function') {
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

/**
 * Mở camera máy (Android) hoặc hộp chọn ảnh (web). null = người dùng hủy.
 * Phải gọi trong lúc xử lý một thao tác chạm (trình duyệt chặn mở hộp chọn nếu không).
 */
export function capturePhoto(): Promise<CapturedImage | null> {
  if (typeof document === 'undefined') return Promise.reject(new CameraError('unsupported'));
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      input.remove();
      fn();
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return finish(() => resolve(null));
      fileToJpegBase64(file).then(
        (img) => finish(() => resolve(img)),
        (e) => finish(() => reject(toCameraError(e))),
      );
    });
    input.addEventListener('cancel', () => finish(() => resolve(null)));
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Bật camera trực tiếp vào `video`. Trả hàm đóng (tắt đèn camera). Từ chối quyền ⇒ CameraError('permission-denied').
 */
export async function openPreview(video: HTMLVideoElement, facing: 'user' | 'environment' = 'environment'): Promise<() => void> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) throw new CameraError('unsupported');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (e) {
    throw toCameraError(e);
  }
  const stop = () => {
    stream.getTracks().forEach((t) => t.stop());
    if (video.srcObject === stream) video.srcObject = null;
  };
  try {
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play().catch(() => undefined);
  } catch (e) {
    stop();
    throw toCameraError(e);
  }
  return stop;
}

/** Chụp một khung hình từ video đang chạy ⇒ JPEG nhỏ */
export async function grabFrame(video: HTMLVideoElement): Promise<CapturedImage> {
  if (!video.videoWidth || !video.videoHeight) throw new CameraError('failed', 'Camera chưa sẵn sàng');
  return toJpegBase64(video, video.videoWidth, video.videoHeight);
}
