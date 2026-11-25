import type { Readable } from 'node:stream';

/**
 * Kho tệp (Nguyên tắc 4: năng lực trừu tượng). Đổi ruột bằng BLOB_PROVIDER (`fs` | `r2`), code gọi không biết ruột.
 * Khóa do SERVER sinh (`feedback/<feedbackId>/<uuid>.<ext>`), không bao giờ chứa tên tệp của người dùng.
 */
export interface BlobStore {
  /** Ghi thẳng dòng chảy (không đọc hết vào RAM). Quá `maxBytes` => ném BlobTooLargeError và KHÔNG để lại gì. */
  put(key: string, src: Readable, o: { contentType: string; maxBytes: number }): Promise<{ bytes: number }>;
  /** `bytes` = cỡ CẢ tệp (kể cả khi lấy một đoạn). Không có tệp => null. */
  get(key: string, range?: { start: number; end?: number }): Promise<{ stream: Readable; bytes: number; contentType: string } | null>;
  /** Xóa tệp; tệp không tồn tại thì KHÔNG lỗi (idempotent, để thử lại an toàn). */
  delete(key: string): Promise<void>;
  /** Tổng số byte đang lưu (để áp trần BLOB_TOTAL_CAP_MB). */
  totalBytes(): Promise<number>;
}

/** Lỗi có mã máy đọc được, khớp bộ xử lý lỗi của app.ts (statusCode + code) */
export class BlobError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'BlobError';
  }
}

export class BlobTooLargeError extends BlobError {
  constructor(maxBytes: number) {
    super(413, 'file_too_large', `Tệp vượt quá ${maxBytes} byte`);
  }
}

export class BlobKeyError extends BlobError {
  constructor(key: string) {
    super(500, 'invalid_blob_key', `Khóa tệp không hợp lệ: ${JSON.stringify(key).slice(0, 80)}`);
  }
}
