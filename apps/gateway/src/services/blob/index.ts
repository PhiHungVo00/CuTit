import type { GatewayConfig } from '../../config.js';
import type { BlobStore } from './BlobStore.js';
import { FsBlobStore } from './fsBlobStore.js';

export type { BlobStore } from './BlobStore.js';
export { BlobError, BlobKeyError, BlobTooLargeError } from './BlobStore.js';

/** Chọn ruột kho tệp theo cấu hình (BLOB_PROVIDER). `r2` làm ở dự án triển khai: chỉ cần khớp interface BlobStore. */
export function createBlobStore(config: Pick<GatewayConfig, 'BLOB_PROVIDER' | 'BLOB_DIR'>): BlobStore {
  if (config.BLOB_PROVIDER === 'r2') throw new Error('BLOB_PROVIDER=r2 chưa được cài đặt (làm ở dự án triển khai); dùng BLOB_PROVIDER=fs');
  return new FsBlobStore(config.BLOB_DIR);
}
