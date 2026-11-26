import { useMemo, useState, type FormEvent } from 'react';
import qrcode from 'qrcode-generator';
import { Button } from '@vietlearning/ui';
import { AdminRequestError, type AdminClient } from '@vietlearning/api-client/admin';
import { useI18n } from '../i18n.js';
import { errorText } from '../session.js';

type Phase = { t: 'invite' } | { t: 'qr'; otpauthUrl: string; secret: string } | { t: 'backup'; codes: string[] };

/**
 * Lần đầu: mã mời → mã QR + chuỗi bí mật → mã 6 số đầu tiên → 10 mã dự phòng (chỉ hiện một lần).
 * Phải bấm "Tôi đã lưu" mới đi tiếp (đã đăng nhập từ lúc xác nhận, nhưng chưa vào trang chính).
 */
export function EnrollPage({ client, ticket, onDone, onRestart }: { client: AdminClient; ticket: string; onDone: () => void; onRestart: (message: string) => void }) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>({ t: 'invite' });
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      if (err instanceof AdminRequestError && err.code === 'ticket_invalid') return onRestart(t('errTicket'));
      // 403 ở bước mã mời = mã sai/hết hạn (không phải thiếu quyền)
      if (phase.t === 'invite' && err instanceof AdminRequestError && err.kind === 'forbidden') setError(t('errInvite'));
      else setError(errorText(t, err, phase.t === 'invite' ? 'other' : 'totp'));
    } finally {
      setBusy(false);
    }
  }

  if (phase.t === 'backup') {
    return (
      <main className="card narrow" aria-labelledby="bk-h">
        <h1 id="bk-h">{t('backupTitle')}</h1>
        <p className="muted">{t('backupHelp')}</p>
        <ul className="codes" aria-label={t('backupTitle')}>
          {phase.codes.map((c) => (
            <li key={c}>
              <code>{c}</code>
            </li>
          ))}
        </ul>
        <Button size="lg" onClick={() => (setPhase({ t: 'invite' }), onDone())}>
          {t('backupSaved')}
        </Button>
      </main>
    );
  }

  if (phase.t === 'qr') {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      void run(async () => {
        const r = await client.confirmTotp(ticket, value.trim());
        setValue('');
        setPhase({ t: 'backup', codes: r.backupCodes });
      });
    };
    return (
      <main className="card narrow" aria-labelledby="qr-h">
        <h1 id="qr-h">{t('qrTitle')}</h1>
        <p className="muted">{t('qrHelp')}</p>
        <Qr text={phase.otpauthUrl} label={t('qrAlt')} />
        <p className="muted">{t('secretLabel')}</p>
        <p>
          <code className="secret">{phase.secret}</code>
        </p>
        <form onSubmit={submit} noValidate>
          <label>
            {t('totpCode')}
            <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus required />
          </label>
          {error ? <p role="alert" className="error">{error}</p> : null}
          <Button type="submit" size="lg" busy={busy} disabled={!/^\d{6}$/.test(value.trim())}>
            {t('confirmBtn')}
          </Button>
        </form>
      </main>
    );
  }

  const submitInvite = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const r = await client.enroll(ticket, value.trim().toLowerCase());
      setValue('');
      setPhase({ t: 'qr', otpauthUrl: r.otpauthUrl, secret: r.secret });
    });
  };
  return (
    <main className="card narrow" aria-labelledby="inv-h">
      <h1 id="inv-h">{t('inviteTitle')}</h1>
      <p className="muted">{t('inviteHelp')}</p>
      <form onSubmit={submitInvite} noValidate>
        <label>
          {t('inviteCode')}
          <input value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={17} autoFocus required />
        </label>
        {error ? <p role="alert" className="error">{error}</p> : null}
        <Button type="submit" size="lg" busy={busy} disabled={!/^[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5}$/i.test(value.trim())}>
          {t('inviteBtn')}
        </Button>
      </form>
    </main>
  );
}

/** Mã QR vẽ bằng phần tử SVG của React (không chèn HTML thô, không ảnh data:) — nền trắng cố định để máy quét đọc được ở cả giao diện tối */
function Qr({ text, label }: { text: string; label: string }) {
  const cells = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    const dark: Array<[number, number]> = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) dark.push([r, c]);
    return { n, dark };
  }, [text]);
  const quiet = 4;
  const size = cells.n + quiet * 2;
  return (
    <svg className="qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#ffffff" />
      {cells.dark.map(([r, c]) => (
        <rect key={`${r}-${c}`} x={c + quiet} y={r + quiet} width="1" height="1" fill="#000000" />
      ))}
    </svg>
  );
}
