import type { FastifyBaseLogger } from 'fastify';
import type { DbProvider } from '../db/client.js';
import type { BlobStore } from '../services/blob/BlobStore.js';
import { runFeedbackPurge } from '../services/feedback/purge.js';

const FIRST_MS = 60_000;
const EVERY_MS = 24 * 3600 * 1000;

/**
 * Job dọn tệp góp ý: chạy lần đầu sau 1 phút, rồi mỗi 24 giờ (không mở DB lúc khởi động/test). `runFeedbackPurge` idempotent
 * nên nhiều instance cùng chạy vẫn an toàn. Trả hàm dừng (gọi khi đóng app). Tắt hẳn khi NODE_ENV=test (test gọi trực tiếp).
 */
export function startFeedbackPurgeJob(o: { db: DbProvider; blob: BlobStore; log: FastifyBaseLogger; enabled: boolean; now?: () => Date }): () => void {
  if (!o.enabled) return () => undefined;
  const run = () =>
    o.db
      .get()
      .then((d) => runFeedbackPurge(d, o.blob, (o.now ?? (() => new Date()))()))
      .then((r) => (r.images || r.videos || r.stale || r.retried) && o.log.info(r, 'feedback files purged'))
      .catch((err: unknown) => o.log.warn({ err }, 'feedback purge failed'));
  let timer: NodeJS.Timeout = setTimeout(() => {
    void run();
    timer = setInterval(() => void run(), EVERY_MS).unref();
  }, FIRST_MS).unref();
  return () => {
    clearTimeout(timer);
    clearInterval(timer);
  };
}
