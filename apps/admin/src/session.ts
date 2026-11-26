import { createAdminClient, type AdminClient, AdminRequestError } from '@vietlearning/api-client/admin';
import type { StaffRoleValue } from '@vietlearning/contracts/api';
import type { T } from './i18n.js';

/** Gốc Gateway: cấu hình LÚC BUILD (VITE_GATEWAY_URL), không phải bí mật. */
export const GATEWAY_URL: string = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:4000';

export interface SessionHandle {
  client: AdminClient;
  /** Đăng ký nghe sự kiện "phiên đã hết hạn" (refresh hỏng). Trả hàm hủy. */
  onExpired(fn: () => void): () => void;
}

/** Tạo client + cầu nối sự kiện hết phiên. Access token chỉ nằm trong bộ nhớ của client; cookie refresh HttpOnly do server cấp. */
export function createSessionHandle(baseUrl: string = GATEWAY_URL): SessionHandle {
  const listeners = new Set<() => void>();
  const client = createAdminClient(baseUrl, { onSessionExpired: () => listeners.forEach((f) => f()) });
  return {
    client,
    onExpired(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    }
  };
}

/**
 * Quyền hiển thị ở client (CHỈ để ẩn/khóa nút). Quyền thật do server kiểm mỗi request: hiện tại Gateway chỉ cho `owner`,
 * các vai trò khác sẽ nhận 403 và giao diện báo "không có quyền".
 */
export const can = {
  viewQueue: (roles: readonly StaffRoleValue[]) => roles.length > 0,
  changeStatus: (roles: readonly StaffRoleValue[]) => roles.includes('owner') || roles.includes('editor'),
  viewFiles: (roles: readonly StaffRoleValue[]) => roles.includes('owner') || roles.includes('editor') || roles.includes('reviewer'),
  viewAudit: (roles: readonly StaffRoleValue[]) => roles.includes('owner')
};

/** Đổi lỗi của client thành câu tiếng người (không lộ chi tiết kỹ thuật) */
export function errorText(t: T, e: unknown, context: 'login' | 'totp' | 'other' = 'other'): string {
  if (!(e instanceof AdminRequestError)) return t('errServer');
  switch (e.kind) {
    case 'offline':
      return t('errOffline');
    case 'timeout':
      return t('errTimeout');
    case 'invalid-credentials':
      if (e.code === 'ticket_invalid') return t('errTicket');
      return context === 'totp' ? t('errTotp') : t('errCreds');
    case 'forbidden':
      return t('errForbidden');
    case 'rate-limited':
      return t('errRate');
    case 'disabled':
      return t('errDisabled');
    case 'contract':
      return t('errContract');
    case 'not-found':
      return t('errNotFound');
    case 'gone':
      return t('errGone');
    case 'invalid-request':
      return t('errInvalid');
    case 'session-expired':
      return t('noticeExpired');
    default:
      return t('errServer');
  }
}
