/** Che chữ ký của URL tệp quản trị trong log truy cập (chữ ký còn hiệu lực 5 phút nên không để lại trong log) */
export function redactSignedUrl(url: string): string {
  return url.replace(/([?&]sig=)[^&#]*/g, '$1[redacted]');
}
