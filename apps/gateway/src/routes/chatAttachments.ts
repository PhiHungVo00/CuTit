import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { AttachmentUploadResponseSchema, AttachmentUrlResponseSchema, CHAT_LIMITS, ChatErrorCode, WaveformSchema } from '@vietlearning/contracts/api';
import type { RouteDeps } from '../app.js';
import { schema } from '../db/client.js';
import { parseOr400, respond } from '../lib/validate.js';
import { GatewayError, requireUserId } from '../pipeline/RequestPipeline.js';
import { assertDmReachable, dmPeerOf, getMembership } from '../services/chat/conversations.js';
import { assertEligible, closedChatEligibility, type ChatEligibilityFn } from '../services/chat/eligibility.js';
import { ChatBlobMeter, SNIFF_BYTES, attachmentUrl, discardFreshAttachment, runChatBlobMaintenance, saveAttachment, type UploadMeta } from '../services/chat/attachments.js';
import { CHAT_BLOB_URL_PATH, createChatBlobUrlSigner } from '../services/chat/blobUrl.js';

export interface ChatAttachmentDeps extends RouteDeps {
  eligibility?: ChatEligibilityFn;
}

const MB = 1024 * 1024;
/** Thân yêu cầu tối đa: tệp lớn nhất (giọng nói 3 MB) + phần `meta` + đường biên. CHỈ route này, không đổi multipart toàn cục. */
const BODY_LIMIT = CHAT_LIMITS.voiceBytes + 256 * 1024;
/** Trang chat tải nhiều ảnh/tin thoại một lúc: trần theo IP đủ rộng, chỉ để chống dò chữ ký hàng loạt */
const BLOB_IP_PER_MINUTE = 300;
const MAINTENANCE_EVERY_MS = 10 * 60_000;

/** Phần chữ `meta` đi TRƯỚC phần tệp (kiểm xong mới nhận byte đầu tiên). Khai theo contract: durationMs ≤ 120 000, waveform ≤ 64 số. */
const UploadMetaSchema = z
  .object({
    cid: z.string().uuid(),
    durationMs: z.number().int().min(0).max(CHAT_LIMITS.voiceMs).optional(),
    waveform: WaveformSchema.optional(),
    width: z.number().int().min(1).max(CHAT_LIMITS.imageMaxEdge).optional(),
    height: z.number().int().min(1).max(CHAT_LIMITS.imageMaxEdge).optional()
  })
  .strict();
const IdParams = z.object({ id: z.string().uuid() });
const UUID_RE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** Khóa do server sinh: chat/<uuid>/<uuid>.<đuôi>; mọi thứ khác bị loại TRƯỚC khi chạm kho tệp (dù chữ ký đúng) */
const KEY_RE = new RegExp(`^chat/${UUID_RE}/${UUID_RE}\\.(webp|jpg|png|weba|ogg|m4a)$`);
const BlobQuery = z.object({ k: z.string().max(300), exp: z.string().max(16), sig: z.string().max(100) });

const err = (status: number, code: string, message: string) => new GatewayError(status, code, message);
const attachmentInvalid = (message: string) => err(400, ChatErrorCode.attachmentInvalid, message);

/** Rút bỏ phần thân còn lại (có giới hạn) để phản hồi lỗi tới được client; vượt giới hạn thì cắt kết nối */
function discardRest(req: FastifyRequest): void {
  const raw = req.raw;
  if (raw.readableEnded || raw.destroyed) return;
  raw.unpipe();
  let n = 0;
  raw.on('data', (c: Buffer) => {
    n += c.length;
    if (n > BODY_LIMIT) raw.destroy();
  });
  raw.resume();
}

/** Lỗi của @fastify/multipart → lỗi của Gateway */
function mapMultipartError(e: unknown): unknown {
  const code = (e as { code?: string }).code;
  if (code === 'FST_FILES_LIMIT') return attachmentInvalid('Mỗi lần chỉ tải một tệp');
  if (code === 'FST_REQ_FILE_TOO_LARGE') return err(413, 'file_too_large', 'Tệp quá lớn');
  if (code === 'FST_PARTS_LIMIT' || code === 'FST_FIELDS_LIMIT') return err(400, 'invalid_request', 'Yêu cầu có quá nhiều phần');
  if (code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') return err(415, 'unsupported_media_type', 'Cần multipart/form-data');
  return e;
}

type Range = { start: number; end: number } | 'ignore' | 'unsatisfiable';
/** Một khoảng `bytes=a-b` | `bytes=a-` | `bytes=-n`. Đơn vị lạ hoặc nhiều khoảng => bỏ qua Range (phục vụ cả tệp, đúng RFC 9110) */
function parseRange(header: string | undefined, size: number): Range {
  if (!header) return 'ignore';
  if (!/^bytes=/i.test(header) || header.includes(',')) return 'ignore';
  const m = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'unsatisfiable';
  if (m[1] === '') {
    const n = Number(m[2]);
    if (n === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}

/**
 * Dự án 4, Task 8 — tải ảnh/giọng nói lên + xin URL ký (trong scope /v1: đã xác thực). Cùng cổng như mọi route chat: cờ CHAT_ENABLED →
 * cổng điều kiện (đủ 18, không khách, có handle, không khóa) chạy TRƯỚC khi đọc thân yêu cầu. userId luôn từ token.
 * `meter` (sổ đặt chỗ byte/trần dung lượng/giới hạn ngày) là MỘT đối tượng cho cả app: dùng chung giữa mọi yêu cầu.
 */
export const chatAttachmentRoutes: FastifyPluginAsync<ChatAttachmentDeps> = async (server, deps) => {
  const { db, config, blob, clock } = deps;
  const eligibility = deps.eligibility ?? closedChatEligibility;
  const meter = new ChatBlobMeter();
  // Production tắt chat có thể không có khóa: không dựng bộ ký (preHandler đã trả 404 khi chat tắt)
  const signer = config.CHAT_BLOB_URL_SECRET ? createChatBlobUrlSigner(config.CHAT_BLOB_URL_SECRET, clock) : null;
  const capBytes = config.CHAT_BLOB_TOTAL_CAP_MB * MB;
  const perRoute = { config: { rateLimit: { max: config.CHAT_RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' } } };

  server.addHook('preHandler', async (req: FastifyRequest) => {
    if (!config.CHAT_ENABLED) throw new GatewayError(404, 'chat_disabled', 'Tính năng nhắn tin chưa được bật');
    await assertEligible(await db.get(), eligibility, requireUserId(req));
  });

  // Việc nền: dọn tệp chưa gắn quá 1 giờ, thử lại hàng xóa, dọn `.tmp/` cũ. Không chạy ở test (test gọi thẳng hàm).
  if (config.CHAT_ENABLED && config.NODE_ENV !== 'test') {
    const timer = setInterval(() => {
      void (async () => {
        try {
          await runChatBlobMaintenance(await db.get(), blob, clock());
        } catch (e) {
          server.log.warn({ err: e }, 'chat blob maintenance failed');
        }
      })();
    }, MAINTENANCE_EVERY_MS);
    timer.unref();
    server.addHook('onClose', async () => clearInterval(timer));
  }

  // POST /v1/chat/attachments (multipart: phần `meta` JSON rồi phần `file`) → { attachmentId }
  server.post('/chat/attachments', { bodyLimit: BODY_LIMIT, ...perRoute }, async (req, reply) => {
    const userId = requireUserId(req);
    if (!req.isMultipart()) throw err(415, 'unsupported_media_type', 'Cần multipart/form-data');
    if (Number(req.headers['content-length'] ?? 0) > BODY_LIMIT) {
      discardRest(req);
      throw err(413, 'file_too_large', 'Yêu cầu quá lớn');
    }
    const d = await db.get();
    try {
      let meta: z.infer<typeof UploadMetaSchema> | undefined;
      let result: { attachmentId: string; key: string } | undefined;
      try {
        // throwFileSizeLimit có ở @fastify/multipart v8 nhưng thiếu trong kiểu của `parts()`; bộ đếm của kho tệp chặn trước giới hạn này
        const parts = req.parts({
          throwFileSizeLimit: false,
          limits: { files: 1, fileSize: CHAT_LIMITS.voiceBytes + 1, fields: 1, fieldSize: 16 * 1024, parts: 2 }
        } as Parameters<typeof req.parts>[0]);
        for await (const part of parts) {
          if (part.type === 'field') {
            if (part.fieldname !== 'meta' || meta !== undefined || part.valueTruncated) throw attachmentInvalid('Phần `meta` không hợp lệ');
            let raw: unknown;
            try {
              raw = typeof part.value === 'string' ? JSON.parse(part.value) : part.value;
            } catch {
              throw attachmentInvalid('Phần `meta` không phải JSON');
            }
            const parsed = UploadMetaSchema.safeParse(raw);
            if (!parsed.success) throw attachmentInvalid('Phần `meta` không hợp lệ (cid, durationMs ≤ 120000, waveform ≤ 64 số)');
            meta = parsed.data;
            continue;
          }
          if (part.fieldname !== 'file') throw attachmentInvalid('Tên phần tệp phải là `file`');
          if (!meta) throw attachmentInvalid('Phần `meta` phải đi trước phần tệp');
          if (result) throw attachmentInvalid('Mỗi lần chỉ tải một tệp');

          // Quyền TRƯỚC byte đầu tiên: người ngoài cuộc không ghi được gì vào kho
          const { conv } = await getMembership(d, userId, meta.cid);
          if (conv.kind === 'dm') {
            const peer = await dmPeerOf(d, meta.cid, userId);
            if (!peer) throw err(404, ChatErrorCode.peerUnavailable, 'Người này không còn khả dụng để nhắn tin');
            await assertDmReachable(d, userId, peer, eligibility);
          }

          // Đọc đầu tệp để nhận dạng theo NỘI DUNG (không tin Content-Type/tên tệp do client gửi)
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
          result = await saveAttachment(
            { db: d, blob, meter, capBytes, onWarning: (u) => req.log.warn({ usedBytes: u.usedBytes, capBytes: u.capBytes, ratio: u.ratio }, 'chat_blob_storage_80pct') },
            {
              userId,
              conversationId: meta.cid,
              meta: meta as UploadMeta,
              first: Buffer.concat(head),
              rest: ended ? null : it,
              isAborted: () => req.raw.readableAborted || req.raw.aborted,
              now: clock()
            }
          );
          if (part.file.truncated) throw err(413, 'file_too_large', 'Tệp quá lớn');
        }
      } catch (e) {
        // lỗi SAU khi tệp đã chốt (phần tệp thứ hai, tệp bị cắt…): yêu cầu thất bại thì không để tệp lại
        if (result) await discardFreshAttachment({ db: d, blob }, result).catch(() => undefined);
        throw mapMultipartError(e);
      }
      if (!result) throw attachmentInvalid('Thiếu tệp');
      // client ngắt ngay sau khi tệp chốt: không còn ai nhận phản hồi (id), bỏ tệp
      if (req.raw.readableAborted || req.raw.aborted) {
        await discardFreshAttachment({ db: d, blob }, result).catch(() => undefined);
        throw err(400, 'upload_aborted', 'Kết nối bị ngắt khi đang gửi');
      }
      return respond(AttachmentUploadResponseSchema, { attachmentId: result.attachmentId });
    } catch (e) {
      discardRest(req);
      throw e;
    }
  });

  // GET /v1/chat/attachments/:id/url → URL ký 5 phút (chỉ thành viên cuộc trò chuyện)
  server.get('/chat/attachments/:id/url', perRoute, async (req, reply) => {
    const userId = requireUserId(req);
    const p = parseOr400(IdParams, req.params, reply);
    if (!p) return reply;
    if (!signer) throw new GatewayError(503, 'chat_disabled', 'Chưa cấu hình khóa ký tệp chat');
    return respond(AttachmentUrlResponseSchema, await attachmentUrl(await db.get(), signer, userId, p.id));
  });
};

/**
 * `GET /v1/chat/blob?k&exp&sig` — NGOÀI scope /v1 (không có header Bearer): chữ ký HMAC 5 phút là xác thực. Đăng ký riêng với bộ đếm
 * theo IP, chỉ khi CHAT_ENABLED. Content-Type lấy từ DB (loại đã kiểm magic bytes lúc nhận), `nosniff`, `Content-Disposition:
 * attachment` (mở thẳng URL thì tải về; <img>/<audio> vẫn dùng được), CSP `sandbox`, `Range` cho giọng nói, không trả khóa/đường dẫn.
 * Giới hạn đã biết: URL còn sống tới 5 phút sau khi tin bị thu hồi (không biết "ai đang xem" vì chữ ký là xác thực).
 */
export const chatBlobRoutes: FastifyPluginAsync<RouteDeps> = async (server, { db, config, blob, clock }) => {
  if (!config.CHAT_BLOB_URL_SECRET) return; // chỉ được đăng ký khi CHAT_ENABLED, lúc đó config đã buộc có khóa
  const signer = createChatBlobUrlSigner(config.CHAT_BLOB_URL_SECRET, clock);
  await server.register(rateLimit, {
    max: BLOB_IP_PER_MINUTE,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip
  });
  server.get(CHAT_BLOB_URL_PATH, async (req, reply) => {
    const q = BlobQuery.safeParse(req.query);
    // Thiếu/sai/hết hạn: MỘT mã 403, không phân biệt (không cho dò)
    if (!q.success || !signer.verify(q.data.k, q.data.exp, q.data.sig)) return reply.status(403).send({ error: ChatErrorCode.forbidden });
    const key = q.data.k;
    if (!KEY_RE.test(key)) return reply.status(404).send({ error: 'not_found' });
    const [a] = await (await db.get()).select().from(schema.chatAttachments).where(eq(schema.chatAttachments.blobKey, key));
    if (!a || a.purgedAt) return reply.status(404).send({ error: 'not_found' });

    const range = parseRange(req.headers.range, a.bytes);
    if (range === 'unsatisfiable') return reply.status(416).header('content-range', `bytes */${a.bytes}`).send({ error: 'range_not_satisfiable' });
    const got = await blob.get(key, range === 'ignore' ? undefined : range);
    if (!got) return reply.status(404).send({ error: 'not_found' });

    reply
      .header('content-type', a.contentType)
      .header('x-content-type-options', 'nosniff')
      .header('content-disposition', `attachment; filename="tep-dinh-kem.${a.media === 'image' ? 'img' : 'audio'}"`)
      .header('content-security-policy', "default-src 'none'; sandbox")
      .header('cross-origin-resource-policy', 'cross-origin')
      .header('accept-ranges', 'bytes')
      .header('cache-control', 'private, no-store');
    if (range === 'ignore') return reply.status(200).header('content-length', String(got.bytes)).send(got.stream);
    return reply
      .status(206)
      .header('content-range', `bytes ${range.start}-${range.end}/${got.bytes}`)
      .header('content-length', String(range.end - range.start + 1))
      .send(got.stream);
  });
};
