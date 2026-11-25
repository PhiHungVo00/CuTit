/**
 * Chỉ cho mở URL ra ngoài khi là `https:` hợp lệ, không kèm tài khoản/mật khẩu (`https://a@evil`).
 * Gateway là bên giữ danh sách host (APK_DOWNLOAD_HOSTS); client không có danh sách nên chỉ chặn lược đồ lạ
 * (`http:`, `javascript:`, `intent:`, `data:`...) và URL hỏng. Trả về URL đã chuẩn hóa, hoặc null.
 */
export function safeHttpsUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || !u.hostname) return null;
    return u.toString();
  } catch {
    return null;
  }
}
