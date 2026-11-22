import { useState } from 'react';
import { PASSWORD_MIN, UsernameSchema } from '@vietlearning/contracts/api';
import { BusyLabel, card, primaryBtn, secondaryBtn } from '../common/ui';
import { BackupCodeScreen } from './BackupCodeScreen';
import { defaultDeps, type AuthDeps } from './deps';
import { useT } from './i18n';
import { Alert, PasswordField, TextField, authError } from './parts';

type Method = 'backup' | 'email';

/**
 * Quên mật khẩu. Đường MÃ DỰ PHÒNG luôn có. Đường EMAIL chỉ hiện khi `deps.mailReset()` (MAIL_PROVIDER khác `none`):
 * Gateway luôn trả 202 cho /password/forgot nên giao diện không tự biết mail có chạy không — với `none`, chỉ chỉ đường mã dự phòng.
 * Màn không bao giờ cho biết tên đăng nhập/email có tồn tại hay không.
 */
export function ForgotPassword({ deps = defaultDeps, onBack }: { deps?: AuthDeps; onBack: () => void }) {
  const t = useT();
  const mail = deps.mailReset();
  const [method, setMethod] = useState<Method>('backup');
  const [username, setUsername] = useState('');
  const [backup, setBackup] = useState('');
  const [who, setWho] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ newCode?: string } | null>(null);

  if (done) {
    return done.newCode ? (
      <BackupCodeScreen code={done.newCode} fresh onContinue={onBack} />
    ) : (
      <section className={card} aria-labelledby="ct-reset-done">
        <h2 id="ct-reset-done" className="m-0 text-lg font-extrabold text-heading">
          {t('forgotTitle')}
        </h2>
        <Alert kind="ok">{t('resetDone')}</Alert>
        <button type="button" className={primaryBtn} onClick={onBack}>
          {t('resetDoneGo')}
        </button>
      </section>
    );
  }

  const run = async (fn: () => Promise<void>, ctx: 'backup' | 'auth' | 'email' | 'reset' = 'auth') => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(authError(err, t, ctx));
    } finally {
      setBusy(false);
    }
  };

  const submitBackup = () => {
    const u = UsernameSchema.safeParse(username);
    if (!u.success) return setError(t('errBackupBad'));
    if (pw.length < PASSWORD_MIN) return setError(t('errPasswordShort'));
    void run(async () => {
      const r = await (await deps.session()).resetPasswordWithBackup(u.data, backup, pw);
      setDone({ newCode: r.backupCode });
    }, 'backup');
  };

  const sendCode = () =>
    void run(async () => {
      await (await deps.session()).forgotPassword(who.trim());
      setSent(true); // luôn báo trung tính, kể cả khi tài khoản không có
    });

  const submitEmail = () => {
    if (pw.length < PASSWORD_MIN) return setError(t('errPasswordShort'));
    void run(async () => {
      await (await deps.session()).resetPasswordWithEmail(who.trim(), code, pw);
      setDone({});
    }, 'reset');
  };

  return (
    <section className={card} aria-labelledby="ct-forgot-h">
      <h2 id="ct-forgot-h" className="m-0 text-xl font-extrabold text-heading">
        {t('forgotTitle')}
      </h2>
      <p className="m-0 text-[15px] text-ink-soft">{t('forgotIntro')}</p>

      {mail && (
        <div role="group" aria-label={t('forgotMethods')} className="grid grid-cols-2 gap-2">
          {(['backup', 'email'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={method === m}
              onClick={() => {
                setMethod(m);
                setError(null);
              }}
              className={`min-h-12 rounded-xl border-2 px-2 font-bold ${method === m ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface-2 text-ink-soft'}`}
            >
              {m === 'backup' ? t('methodBackup') : t('methodEmail')}
            </button>
          ))}
        </div>
      )}

      {method === 'backup' || !mail ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submitBackup();
          }}
        >
          <TextField label={t('username')} value={username} onChange={setUsername} autoComplete="username" maxLength={64} />
          <TextField label={t('backupInput')} value={backup} onChange={setBackup} mono maxLength={40} />
          <PasswordField label={t('newPassword')} value={pw} onChange={setPw} autoComplete="new-password" hint={t('passwordHint')} strength />
          <button type="submit" className={primaryBtn} disabled={busy || !username || !backup || !pw}>
            <BusyLabel busy={busy} label={t('resetSubmit')} busyLabel={t('working')} />
          </button>
          {!mail && <p className="m-0 text-sm text-ink-muted">{t('forgotNoMail')}</p>}
        </form>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (sent) submitEmail();
            else sendCode();
          }}
        >
          <TextField label={t('emailOrUser')} value={who} onChange={setWho} autoComplete="username" maxLength={254} />
          {sent && (
            <>
              <Alert kind="info">{t('codeSentNeutral')}</Alert>
              <TextField label={t('codeInput')} value={code} onChange={setCode} inputMode="numeric" maxLength={6} mono />
              <PasswordField label={t('newPassword')} value={pw} onChange={setPw} autoComplete="new-password" hint={t('passwordHint')} strength />
            </>
          )}
          <button type="submit" className={primaryBtn} disabled={busy || !who.trim() || (sent && (code.length !== 6 || !pw))}>
            <BusyLabel busy={busy} label={sent ? t('resetSubmit') : t('sendCode')} busyLabel={t('working')} />
          </button>
          {sent && (
            <button type="button" className={secondaryBtn} disabled={busy} onClick={sendCode}>
              {t('sendCode')}
            </button>
          )}
        </form>
      )}

      {error && <Alert>{error}</Alert>}
      <button type="button" className={secondaryBtn} disabled={busy} onClick={onBack}>
        {t('authBack')}
      </button>
    </section>
  );
}
