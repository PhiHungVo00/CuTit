import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { z } from 'zod';
import {
  FEEDBACK_LIMITS,
  FeedbackCreateMetaSchema,
  FeedbackCreateResponseSchema,
  FeedbackErrorCode,
  MyFeedbackListSchema,
  UnreadCountSchema
} from '@vietlearning/contracts/api';
import type { RouteDeps } from '../app.js';
import { parseOr400, respond } from '../lib/validate.js';
import { requireUserId } from '../pipeline/RequestPipeline.js';
import { BlobTooLargeError } from '../services/blob/BlobStore.js';
import { SNIFF_BYTES, extOf, sniffMedia } from '../services/feedback/fileSniff.js';
import { countRecent, createFeedback, listMine, markRead, unreadCount, type NewFile } from '../services/feedback/repo.js';
import { deleteKeysOrQueue } from '../services/feedback/purge.js';

const MB = 1024 * 1024;
/** Tổng thân yêu cầu tối đa: 3 ảnh + 1 video = 65 MB theo từng loại; trần chung 66 MB (spec) + chừa phần chữ/đường biên */
const TOTAL_BYTES = 66 * MB;
const BODY_LIMIT = TOTAL_BYTES + 2 * MB;
/** Phần dư tối đa còn rút bỏ khi đã từ chối (để client nhận được phản hồi thay vì thấy kết nối đứt) */
const DISCARD_MAX = BODY_LIMIT;

class FeedbackHttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

const tooMany = () => new FeedbackHttpError(400, FeedbackErrorCode.tooManyFiles, `Tối đa ${FEEDBACK_LIMITS.images} ảnh và ${FEEDBACK_LIMITS.videos} video`);
const badType = () => new FeedbackHttpError(400, FeedbackErrorCode.fileType, 'Chỉ nhận ảnh WebP/JPEG/PNG và video MP4/WebM/MOV');
const tooLarge = (what: string) => new FeedbackHttpError(413, FeedbackErrorCode.fileTooLarge, `${what} quá lớn`);
const storageFull = () => new FeedbackHttpError(507, FeedbackErrorCode.storageFull, 'Kho tệp đang đầy: gửi bản chỉ có chữ nhé');
const aborted = () => new FeedbackHttpError(400, 'upload_aborted', 'Kết nối bị ngắt khi đang gửi');

const IdParams = z.object({ id: z.string().uuid() });

/** Rút bỏ phần thân còn lại (có giới hạn) để phản hồi lỗi tới được client; vượt giới hạn thì cắt kết nối */
function discardRest(req: FastifyRequest): void {
  const raw = req.raw;
  if (raw.readableEnded || raw.destroyed) return;
  raw.unpipe();
  let n = 0;
  raw.on('data', (c: Buffer) => {
    n += c.length;
    if (n > DISCARD_MAX) raw.destroy();
  });
  raw.resume();
}

/** Lỗi của @fastify/multipart → mã lỗi của contract */
function mapMultipartError(err: unknown): unknown {
  const code = (err as { code?: string }).code;
  if (code === 'FST_FILES_LIMIT') return tooMany();
  if (code === 'FST_REQ_FILE_TOO_LARGE') return tooLarge('Tệp');
  if (code === 'FST_PARTS_LIMIT' || code === 'FST_FIELDS_LIMIT') return new FeedbackHttpError(400, 'invalid_request', 'Yêu cầu có quá nhiều phần');
  if (code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') return new FeedbackHttpError(415, 'unsupported_media_type', 'Cần multipart/form-data');
  return err;
}

/**
 * Góp ý / Báo lỗi (dự án 5a, spec §5.2). Mọi route dùng userId từ TOKEN (không bao giờ từ request) => không có đường
 * đọc/ghi góp ý của người khác. Tệp: loại theo magic bytes, tên khóa do server sinh, ghi thẳng dòng chảy xuống kho;
 * DB chỉ ghi SAU khi mọi tệp đã nằm trong kho, lỗi bất kỳ thì xóa các tệp đã ghi.
 */
export const feedbackRoutes: FastifyPluginAsync<RouteDeps> = async (server, { db, pipeline, config, blob }) => {
  // POST /v1/feedback (multipart: phần `meta` JSON + các phần `files`)
  server.post(
    '/feedback',
    {
      bodyLimit: BODY_LIMIT,
      // Giới hạn theo IP/giờ (thêm vào 5 góp ý/người/ngày). Thay giới hạn theo người dùng chung của scope /v1 cho riêng route này.
      config: { rateLimit: { max: config.FEEDBACK_IP_PER_HOUR, timeWindow: '1 hour', keyGenerator: (req: FastifyRequest) => req.ip } }
    },
    async (req, reply) => {
      const userId = requireUserId(req);
      if (!req.isMultipart()) throw new FeedbackHttpError(415, 'unsupported_media_type', 'Cần multipart/form-data');
      const declared = Number(req.headers['content-length'] ?? 0);
      if (declared > BODY_LIMIT) {
        discardRest(req);
        throw tooLarge('Yêu cầu');
      }
      const d = await db.get();
      const now = pipeline.now();
      // Chặn sớm (rẻ) trước khi nhận tệp; kiểm lại trong transaction ghi DB để chặn các yêu cầu song song
      if ((await countRecent(d, userId, now)) >= FEEDBACK_LIMITS.perDay) {
        discardRest(req);
        throw new FeedbackHttpError(429, FeedbackErrorCode.feedbackLimit, 'Bạn đã gửi đủ số góp ý cho hôm nay, mai gửi tiếp nhé');
      }

      const id = randomUUID();
      const written: NewFile[] = [];
      let metaRaw: unknown;
      let images = 0;
      let videos = 0;
      let totalIn = 0;
      let used: number | null = null;
      const capBytes = config.BLOB_TOTAL_CAP_MB * MB;

      try {
        try {
          // throwFileSizeLimit có ở @fastify/multipart v8 nhưng thiếu trong kiểu của `parts()`; bộ đếm của kho tệp đã chặn trước giới hạn này
          const parts = req.parts({
            throwFileSizeLimit: false,
            limits: { files: FEEDBACK_LIMITS.images + FEEDBACK_LIMITS.videos, fileSize: FEEDBACK_LIMITS.videoBytes + 1, fields: 1, fieldSize: 64 * 1024, parts: 6 }
          } as Parameters<typeof req.parts>[0]);
          for await (const part of parts) {
            if (part.type === 'field') {
              if (part.fieldname !== 'meta' || metaRaw !== undefined || part.valueTruncated) throw new FeedbackHttpError(400, 'invalid_request', 'Phần `meta` không hợp lệ');
              try {
                metaRaw = typeof part.value === 'string' ? JSON.parse(part.value) : part.value;
              } catch {
                throw new FeedbackHttpError(400, 'invalid_request', 'Phần `meta` không phải JSON');
              }
              continue;
            }
            if (part.fieldname !== 'files' && part.fieldname !== 'files[]') throw new FeedbackHttpError(400, 'invalid_request', 'Tên phần tệp phải là `files`');

            // Đọc đầu tệp, nhận dạng theo NỘI DUNG (không tin Content-Type/tên tệp do client gửi)
            const it = part.file[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
            const head: Buffer[] = [];
            let headLen = 0;
            let ended = false;
            while (headLen < SNIFF_BYTES) {
              const r = await it.next();
              if (r.done) {
                ended = true;
                break;
              }
              head.push(r.value);
              headLen += r.value.length;
            }
            const first = Buffer.concat(head);
            const kind = sniffMedia(first);
            if (!kind) throw badType();
            if (kind.media === 'image' ? ++images > FEEDBACK_LIMITS.images : ++videos > FEEDBACK_LIMITS.videos) throw tooMany();
            const maxBytes = kind.media === 'image' ? FEEDBACK_LIMITS.imageBytes : FEEDBACK_LIMITS.videoBytes;
            used ??= await blob.totalBytes();
            const usedAtStart = used;
            let received = 0;
            async function* body(): AsyncGenerator<Buffer> {
              const check = (n: number) => {
                received += n;
                totalIn += n;
                if (totalIn > TOTAL_BYTES) throw tooLarge('Tổng dung lượng tệp');
                if (usedAtStart + totalIn > capBytes) throw storageFull();
              };
              check(first.length);
              yield first;
              while (!ended) {
                const r = await it.next();
                if (r.done) break;
                check(r.value.length);
                yield r.value;
              }
            }
            const key = `feedback/${id}/${randomUUID()}.${extOf(kind.contentType)}`;
            // Ghi vào danh sách TRƯỚC khi put: lỗi giữa chừng cũng xóa/ghi lại khóa này (xóa khóa chưa có tệp là vô hại)
            const entry: NewFile = { key, media: kind.media, contentType: kind.contentType, bytes: 0 };
            written.push(entry);
            try {
              const r = await blob.put(key, Readable.from(body()), { contentType: kind.contentType, maxBytes });
              entry.bytes = r.bytes;
            } catch (err) {
              if (err instanceof BlobTooLargeError) throw tooLarge(kind.media === 'image' ? 'Ảnh' : 'Video');
              throw err;
            }
            if (part.file.truncated) throw tooLarge('Tệp');
          }
        } catch (err) {
          throw mapMultipartError(err);
        }

        // Client ngắt giữa chừng (luồng bị hủy không báo lỗi) => bỏ hết, không tạo dòng DB
        if (req.raw.readableAborted || req.raw.aborted) throw aborted();

        if (metaRaw === undefined) throw new FeedbackHttpError(400, 'invalid_request', 'Thiếu phần `meta`');
        const meta = FeedbackCreateMetaSchema.safeParse(metaRaw);
        if (!meta.success) {
          await deleteKeysOrQueue(d, blob, written.map((w) => w.key), 'feedback_rejected');
          return reply.status(400).send({ error: 'invalid_request', issues: meta.error.issues });
        }
        if (written.some((w) => w.bytes <= 0)) throw badType(); // tệp rỗng

        await createFeedback(d, { id, userId, meta: meta.data, files: written, now, perDay: FEEDBACK_LIMITS.perDay });
        return respond(FeedbackCreateResponseSchema, { id });
      } catch (err) {
        discardRest(req);
        await deleteKeysOrQueue(d, blob, written.map((w) => w.key), 'feedback_failed');
        throw err;
      }
    }
  );

  // GET /v1/feedback/mine — góp ý của CHÍNH mình (không trả khóa/URL tệp)
  server.get('/feedback/mine', async (req) => {
    const userId = requireUserId(req);
    return respond(MyFeedbackListSchema, { items: await listMine(await db.get(), userId) });
  });

  // GET /v1/feedback/mine/unread-count — chấm đỏ
  server.get('/feedback/mine/unread-count', async (req) => {
    const userId = requireUserId(req);
    return respond(UnreadCountSchema, { count: await unreadCount(await db.get(), userId) });
  });

  // POST /v1/feedback/:id/read — của người khác hoặc không có => 404 như nhau (không lộ sự tồn tại)
  server.post('/feedback/:id/read', async (req, reply) => {
    const userId = requireUserId(req);
    const p = parseOr400(IdParams, req.params, reply);
    if (!p) return reply;
    const ok = await markRead(await db.get(), userId, p.id);
    if (!ok) return reply.status(404).send({ error: 'not_found' });
    return reply.status(204).send();
  });
};
