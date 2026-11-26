import type { FastifyPluginAsync } from 'fastify';
import { AppChannelSchema, WS_LIMITS } from '@vietlearning/contracts/api';
import type { RealtimeHub, WsSocketLike } from '../services/realtime/RealtimeHub.js';

/**
 * `GET /ws` (dự án 4, spec 5.6). Nằm NGOÀI `/v1` vì trình duyệt không gửi được header Authorization khi mở WebSocket.
 * Token KHÔNG ở URL: khung đầu tiên client gửi phải là `hello` (RealtimeHub kiểm, 5 giây). Ở đây chỉ bắt tay + giao socket cho hub.
 * Cần `@fastify/websocket` đã đăng ký trong cùng scope (app.ts) với `maxPayload` = WS_LIMITS.frameMaxBytes.
 */
export const wsRoutes: FastifyPluginAsync<{ hub: RealtimeHub }> = async (server, { hub }) => {
  server.get('/ws', { websocket: true }, (socket, req) => {
    try {
      // `channel` không nhạy cảm (khác token): nói kênh để kiểm bản tối thiểu đúng kênh; sai/thiếu thì bỏ qua
      const q = req.query as { channel?: unknown } | undefined;
      const channel = AppChannelSchema.safeParse(q?.channel);
      hub.attach(socket as unknown as WsSocketLike, channel.success ? { channel: channel.data } : {});
    } catch (err) {
      req.log.warn({ err }, 'ws: attach lỗi');
      try {
        socket.close(1011, 'internal_error');
      } catch {
        socket.terminate();
      }
    }
  });
};

/** Tùy chọn `ws` cho @fastify/websocket: khung tối đa 16 KB (vượt ⇒ ws tự đóng 1009), tắt nén (tránh nén-bom, tiết kiệm CPU gói free) */
export const WS_SERVER_OPTIONS = { maxPayload: WS_LIMITS.frameMaxBytes, perMessageDeflate: false } as const;
