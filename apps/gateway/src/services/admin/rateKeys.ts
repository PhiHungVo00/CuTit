/**
 * Khóa bộ đếm giới hạn đăng nhập quản trị (RateCounters, HMAC bằng AUTH_OTP_PEPPER). Dùng chung giữa route và CLI `admin:unlock`.
 * `nameIp`/`totpIp` đếm theo IP (không gỡ được từ CLI vì khóa là HMAC của IP); `name`/`totpUser` là phần có thể bị lợi dụng để khóa chủ app.
 */
export const adminRateKeys = {
  nameIp: (ip: string) => `admin:ip:${ip}`,
  name: (username: string) => `admin:name:${username}`,
  totpIp: (ip: string) => `admin:totp_ip:${ip}`,
  totpUser: (userId: string) => `admin:totp_user:${userId}`
};
