import { useState, type FormEvent } from 'react';
import { Button } from '@vietlearning/ui';
import type { AdminClient } from '@vietlearning/api-client/admin';
import { useI18n } from '../i18n.js';
import { errorText } from '../session.js';
import { TotpPage } from './TotpPage.js';
import { EnrollPage } from './EnrollPage.js';

type Step = { t: 'creds' } | { t: 'totp'; ticket: string } | { t: 'enroll'; ticket: string };

/**
 * Luồng đăng nhập: mật khẩu → (đã có mã 6 số) màn mã 6 số | (lần đầu) màn mã mời → QR → mã dự phòng.
 * Access token do client giữ trong bộ nhớ; ở đây KHÔNG lưu gì xuống trình duyệt.
 */
export function LoginPage({ client, notice, onDone }: { client: AdminClient; notice?: string; onDone: () => void }) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>({ t: 'creds' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  if (step.t === 'totp') {
    return <TotpPage client={client} ticket={step.ticket} onDone={onDone} onRestart={(msg) => (setError(msg), setStep({ t: 'creds' }))} />;
  }
  if (step.t === 'enroll') {
    return <EnrollPage client={client} ticket={step.ticket} onDone={onDone} onRestart={(msg) => (setError(msg), setStep({ t: 'creds' }))} />;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await client.login(username.trim(), password);
      setPassword('');
      setStep({ t: r.next, ticket: r.ticket });
    } catch (err) {
      setError(errorText(t, err, 'login'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="card narrow" aria-labelledby="login-h">
      <h1 id="login-h">{t('loginTitle')}</h1>
      {notice && !error ? <p role="status" className="notice">{notice}</p> : null}
      <form onSubmit={submit} noValidate>
        <label>
          {t('username')}
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required />
        </label>
        <label>
          {t('password')}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error ? <p role="alert" className="error">{error}</p> : null}
        <Button type="submit" size="lg" busy={busy} disabled={!username.trim() || !password}>
          {t('loginBtn')}
        </Button>
      </form>
    </main>
  );
}
