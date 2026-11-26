import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { AdminErrorCode } from '@vietlearning/contracts/api';
import type { RouteDeps } from '../../app.js';
import { schema } from '../../db/client.js';
import type { BlobUrlSigner } from '../../services/admin/signedUrl.js';

/** Khóa do server sinh: feedback/<uuid>/<uuid>.<đuôi> — mọi thứ khác bị loại TRƯỚC khi chạm kho tệp (dù chữ ký đúng) */
const UUID_RE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const KEY_RE = new RegExp(`^feedback/${UUID_RE}/${UUID_RE}\\.(webp|jpg|jpeg|png|mp4|webm|mov)$`);
const EXT: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
const Query = z.object({ k: z.string().max(300), exp: z.string().max(16), sig: z.string().max(100) });

type Parsed = { start: number; end: number } | 'ignore' | 'unsatisfiable';

/** Một khoảng `bytes=a-b` | `bytes=a-` | `bytes=-n`. Đơn vị lạ hoặc nhiều khoảng => bỏ qua Range (phục vụ cả tệp, đúng RFC 9110) */
function parseRange(header: string | undefined, size: number): Parsed {
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
 * `GET /admin/v1/blob?k&exp&sig` — NGOÀI requireAdmin: chữ ký HMAC (5 phút) là xác thực. Thẻ <img>/<video> của trang quản trị
 * (nguồn khác) không gửi được Bearer, nên phải đặt `Cross-Origin-Resource-Policy: cross-origin`.
 * An toàn (ghi chú L3 rà #46): Content-Type lấy từ DB (loại đã kiểm magic bytes lúc nhận), không đoán; `nosniff`;
 * `Content-Disposition: attachment` (mở thẳng URL thì tải về chứ không hiển thị cùng nguồn Gateway; <img>/<video> vẫn dùng được);
 * CSP `sandbox` + `default-src 'none'`; không trả khóa/đường dẫn thật.
 */
export const adminBlobRoutes: FastifyPluginAsync<RouteDeps & { signer: BlobUrlSigner | null }> = async (server, { db, blob, signer }) => {
  server.get('/blob', async (req, reply) => {
    if (!signer) return reply.status(503).send({ error: AdminErrorCode.adminDisabled });
    const q = Query.safeParse(req.query);
    // Thiếu/sai/hết hạn: MỘT mã 403, không phân biệt (không cho dò)
    if (!q.success || !signer.verifyBlobUrl(q.data.k, q.data.exp, q.data.sig)) return reply.status(403).send({ error: AdminErrorCode.forbidden });
    const key = q.data.k;
    if (!KEY_RE.test(key)) return reply.status(404).send({ error: 'not_found' });
    const d = await db.get();
    const [f] = await d.select().from(schema.feedbackFiles).where(eq(schema.feedbackFiles.blobKey, key));
    if (!f) return reply.status(404).send({ error: 'not_found' });
    if (f.purgedAt) return reply.status(410).send({ error: 'file_purged' });

    const range = parseRange(req.headers.range, f.bytes);
    if (range === 'unsatisfiable') return reply.status(416).header('content-range', `bytes */${f.bytes}`).send({ error: 'range_not_satisfiable' });
    const got = await blob.get(key, range === 'ignore' ? undefined : range);
    if (!got) return reply.status(404).send({ error: 'not_found' });

    reply
      .header('content-type', f.contentType)
      .header('x-content-type-options', 'nosniff')
      .header('content-disposition', `attachment; filename="tep-dinh-kem.${EXT[f.contentType] ?? 'bin'}"`)
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
