import type { FastifyPluginAsync } from 'fastify';
import type { FileAudioStore } from '../services/tts/audioStore.js';
import { KEY_RE, PACK_FILE_RE } from '../services/tts/audioStore.js';

/**
 * (helmet mặc định CORP same-origin sẽ chặn <audio> từ app khác origin => đặt cross-origin.)
 * Âm thanh dựng sẵn — CÔNG KHAI, không cần token (thẻ <audio> không gửi được header Authorization; nội dung là
 * câu của khóa học, tên tệp là sha256 nên không đoán/liệt kê được). Chỉ nhận đúng mẫu tên, không có đường dẫn.
 *   GET /audio/<sha256>.wav          — bất biến (khóa đổi khi văn bản/giọng/prompt đổi) => cache 1 năm
 *   GET /audio/packs/<gói>-<miền>.json — manifest gói, đổi theo lần chạy script => cache ngắn
 */
export const audioRoutes: FastifyPluginAsync<{ store: FileAudioStore }> = async (server, { store }) => {
  server.get<{ Params: { file: string } }>('/audio/:file', async (request, reply) => {
    const m = /^([a-f0-9]{64})\.wav$/.exec(request.params.file);
    if (!m || !KEY_RE.test(m[1])) return reply.status(404).send({ error: 'not_found' });
    const wav = await store.read(m[1]);
    if (!wav) return reply.status(404).send({ error: 'not_found' });
    return reply
      .header('cross-origin-resource-policy', 'cross-origin')
      .header('content-type', 'audio/wav').header('cache-control', 'public, max-age=31536000, immutable').send(wav);
  });

  server.get<{ Params: { file: string } }>('/audio/packs/:file', async (request, reply) => {
    if (!PACK_FILE_RE.test(request.params.file)) return reply.status(404).send({ error: 'not_found' });
    const pack = await store.readJson<unknown>(`packs/${request.params.file}`);
    if (!pack) return reply.status(404).send({ error: 'not_found' });
    return reply.header('cross-origin-resource-policy', 'cross-origin').header('cache-control', 'public, max-age=300').send(pack);
  });
};
