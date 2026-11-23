import type { OtpPurpose } from '../auth/otp.js';

/** Thư mã OTP song ngữ: chỉ chứa mã + thời hạn, KHÔNG link (spec 5.3 — chống lừa đảo, không cần tên miền/deep link) */
export function otpEmail(code: string, purpose: OtpPurpose): { subjectVi: string; subjectEn: string; body: string } {
  const vi = purpose === 'reset' ? 'đặt lại mật khẩu' : 'xác minh email';
  const en = purpose === 'reset' ? 'reset your password' : 'verify your email';
  return {
    subjectVi: `Mã ${vi} Bé Cu Tít: ${code}`,
    subjectEn: `Bé Cu Tít code: ${code}`,
    body: [
      `Mã ${vi} của bạn là: ${code}`,
      'Mã có hiệu lực trong 10 phút. Không chia sẻ mã này với ai. Nếu bạn không yêu cầu, hãy bỏ qua thư này.',
      '',
      `Your code to ${en} is: ${code}`,
      'It expires in 10 minutes. Do not share it with anyone. If you did not request it, ignore this email.',
      '',
      '— Bé Cu Tít'
    ].join('\n')
  };
}
