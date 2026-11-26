/** Che chữ ký của URL tệp quản trị trong log truy cập (chữ ký còn hiệu lực 5 phút nên không để lại trong log) */
export function redactSignedUrl(url: string): string {
  // token thiết bị (push) nằm trên đường dẫn DELETE /v1/chat/push-tokens/<token>: không để lại trong log truy cập
  return url.replace(/([?&]sig=)[^&#]*/g, '$1[redacted]').replace(/(\/chat\/push-tokens\/)[^/?#]*/g, '$1[redacted]');
}
