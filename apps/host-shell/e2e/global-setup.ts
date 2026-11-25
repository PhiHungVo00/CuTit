import { GATEWAY_PORT } from '../playwright.config';

/**
 * Làm nóng Gateway trước khi test đầu tiên chạy. Gateway mở PGlite + chạy toàn bộ migration ở request cần DB đầu tiên
 * (~5 s CPU, vài chục giây khi máy tải nặng). Nếu để ca test đầu tiên gánh việc đó thì nó vượt hạn 15 s/30 s của ca
 * (sync.spec, conversation.spec chạy riêng lẻ hay đỏ "lần đầu"). Tài khoản khách tạo ở đây không ảnh hưởng ca nào
 * (mỗi ca có trình duyệt/tài khoản riêng).
 */
export default async function globalSetup(): Promise<void> {
  const res = await fetch(`http://localhost:${GATEWAY_PORT}/v1/auth/guest`, { method: 'POST', signal: AbortSignal.timeout(170_000) });
  if (!res.ok) throw new Error(`Làm nóng Gateway thất bại: HTTP ${res.status}`);
}
