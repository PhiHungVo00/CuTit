/** Đọc lỗi từ client theo kiểu "vịt" (không import GatewayRequestError để chunk nhẹ). */
export interface ErrLike {
  status?: number;
  code?: string;
  kind?: string;
}
const asErr = (e: unknown): ErrLike => (e && typeof e === 'object' ? (e as ErrLike) : {});
export const errCode = (e: unknown): string | undefined => asErr(e).code;
export const isOffline = (e: unknown): boolean => asErr(e).kind === 'offline' || (typeof navigator !== 'undefined' && navigator.onLine === false);
/** Tính năng chưa bật ở máy chủ (CHAT_ENABLED=false → 404) hoặc host chưa gắn client thật */
export const isUnavailable = (e: unknown): boolean => asErr(e).status === 404 || asErr(e).code === 'chat_unavailable';
