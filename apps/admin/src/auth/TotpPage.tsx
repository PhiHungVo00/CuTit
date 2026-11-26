import { useState, type FormEvent } from 'react';
import { Button } from '@vietlearning/ui';
import { AdminRequestError, type AdminClient } from '@vietlearning/api-client/admin';
import { useI18n } from '../i18n.js';
import { errorText } from '../session.js';

/** Bước mã 6 số (hoặc mã dự phòng) của người đã đăng ký. Vé sai/hết hạn ⇒ về màn mật khẩu kèm lời giải thích. */
export function TotpPage({ client, ticket, onDone, onRestart }: { client: AdminClient; ticket: string; onDone: () => void; onRestart: (message: string) => void }) {
  const { t } = useI18n();
  const [backup, setBackup] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ok = backup ? /^[a-z0-9]{5}-[a-z0-9]{5}$/i.test(value.trim()) : /^\d{6}$/.test(value.trim());

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await client.totp(ticket, backup ? { backupCode: value.trim().toLowerCase() } : { code: value.trim() });
      onDone();
    } catch (err) {
      if (err instanceof AdminRequestError && err.code === 'ticket_invalid') return onRestart(t('errTicket'));
      setError(errorText(t, err, 'totp'));
      setValue('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="card narrow" aria-labelledby="totp-h">
      <h1 id="totp-h">{t('totpTitle')}</h1>
      <p className="muted">{t('totpHelp')}</p>
      <form onSubmit={submit} noValidate>
        <label>
          {backup ? t('backupCode') : t('totpCode')}
          <input
            key={backup ? 'b' : 'c'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode={backup ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            autoCapitalize="none"
            maxLength={backup ? 11 : 6}
            autoFocus
            required
          />
        </label>
        {error ? <p role="alert" className="error">{error}</p> : null}
        <Button type="submit" size="lg" busy={busy} disabled={!ok}>
          {t('verifyBtn')}
        </Button>
        <button type="button" className="linklike" onClick={() => (setBackup((b) => !b), setValue(''), setError(null))}>
          {backup ? t('useTotp') : t('useBackup')}
        </button>
      </form>
    </main>
  );
}
