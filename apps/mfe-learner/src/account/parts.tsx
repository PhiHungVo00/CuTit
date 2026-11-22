import { useId, useState, type ReactNode } from 'react';
import { PASSWORD_MIN } from '@vietlearning/contracts/api';
import { useT } from './i18n';

type T = ReturnType<typeof useT>;

export const inputCls = 'min-h-12 w-full rounded-xl border border-line-strong bg-surface px-3 text-base text-ink';

/** Ô nhập có nhãn thật (htmlFor), gợi ý và lỗi gắn bằng aria-describedby */
export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  hint,
  error,
  autoComplete,
  inputMode,
  maxLength,
  mono,
  trailing
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
  error?: string | null;
  autoComplete?: string;
  inputMode?: 'text' | 'numeric' | 'email';
  maxLength?: number;
  mono?: boolean;
  trailing?: ReactNode;
}) {
  const id = useId();
  const describedBy = [hint ? `${id}-h` : '', error ? `${id}-e` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[15px] font-bold text-ink-soft">
        {label}
      </label>
      <div className="flex items-stretch gap-2">
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          inputMode={inputMode}
          maxLength={maxLength}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${inputCls} ${mono ? 'font-mono tracking-wider' : ''}`}
        />
        {trailing}
      </div>
      {hint && (
        <p id={`${id}-h`} className="m-0 text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-e`} role="alert" className="m-0 text-sm font-bold text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}

/** Mật khẩu có nút hiện/ẩn; `strength` bật chỉ báo độ mạnh đơn giản */
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
  error,
  strength
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
  hint?: string;
  error?: string | null;
  strength?: boolean;
}) {
  const t = useT();
  const [shown, setShown] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <TextField
        label={label}
        value={value}
        onChange={onChange}
        type={shown ? 'text' : 'password'}
        autoComplete={autoComplete}
        hint={hint}
        error={error}
        maxLength={128}
        trailing={
          <button
            type="button"
            aria-pressed={shown}
            aria-label={shown ? t('hidePassword') : t('showPassword')}
            onClick={() => setShown((s) => !s)}
            className="min-h-12 min-w-14 rounded-xl border border-line-strong bg-surface-2 px-3 text-sm font-bold text-ink"
          >
            {shown ? t('hideWord') : t('showWord')}
          </button>
        }
      />
      {strength && value.length > 0 && <Strength password={value} t={t} />}
    </div>
  );
}

export function strengthOf(p: string): 0 | 1 | 2 {
  if (p.length < PASSWORD_MIN) return 0;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  return p.length >= 12 || (p.length >= 10 && kinds >= 3) ? 2 : 1;
}

function Strength({ password, t }: { password: string; t: T }) {
  const s = strengthOf(password);
  const label = s === 0 ? t('strengthShort') : s === 1 ? t('strengthOk') : t('strengthGood');
  return (
    <p role="status" className="m-0 flex items-center gap-2 text-sm text-ink-muted">
      <span aria-hidden="true" className="flex w-20 gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= s ? (s === 0 ? 'bg-danger' : 'bg-accent') : 'bg-line-strong'}`} />
        ))}
      </span>
      <span>
        {t('strengthLabel')}: {label}
      </span>
    </p>
  );
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'ok' | 'info'; children: ReactNode }) {
  return (
    <p role={kind === 'error' ? 'alert' : 'status'} className={`m-0 rounded-xl p-3 text-[15px] ${kind === 'error' ? 'bg-danger-soft text-danger-ink' : 'bg-surface-2 text-ink'}`}>
      {children}
    </p>
  );
}

type Ctx = 'auth' | 'backup' | 'password' | 'email' | 'reset';

/**
 * Lỗi Gateway/client => câu cho người dùng. `null` = im lặng (người dùng tự hủy hộp Google).
 * `ctx` đổi nghĩa của `invalid_credentials`: ở /me/* là sai MẬT KHẨU HIỆN TẠI, ở reset-backup là sai tên/mã.
 */
export function authError(err: unknown, t: T, ctx: Ctx = 'auth'): string | null {
  const e = err as { kind?: string; code?: string } | null;
  const code = e?.code;
  if (code === 'google_cancelled') return null;
  // Đặt lại mật khẩu bằng mã email: mọi lỗi liên quan mã chỉ một câu (không lộ tài khoản có tồn tại / mã đã bị khóa)
  if (ctx === 'reset' && (code === 'otp_invalid' || code === 'otp_expired' || code === 'otp_locked' || code === 'invalid_credentials')) return t('errOtp');
  if (e?.kind === 'offline' || e?.kind === 'timeout') return t('errNetwork');
  if (code === 'invalid_credentials') return ctx === 'backup' ? t('errBackupBad') : ctx === 'auth' ? t('errCredentials') : t('errCurrentPassword');
  if (code === 'username_taken') return t('errUsernameTaken');
  if (code === 'weak_password') return t('errWeakPassword');
  if (code === 'rate_limited' || e?.kind === 'quota') return t('errRateLimited');
  if (code === 'merge_ticket_invalid') return t('errTicket');
  if (code === 'identity_in_use') return ctx === 'email' ? t('errEmailInUse') : t('errInUse');
  if (code === 'account_pending_deletion') return t('errPendingDeletion');
  if (code === 'otp_invalid' || code === 'otp_expired') return t('errOtp');
  if (code === 'otp_locked') return t('errOtpLocked');
  if (code === 'provider_unavailable') return t('errProviderUnavailable');
  return t('errGeneric');
}
