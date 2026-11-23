import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ACCOUNT_DELETE_GRACE_DAYS, EmailSchema, PASSWORD_MIN } from '@vietlearning/contracts/api';
import type { SyncStatus } from '@vietlearning/state/sync';
import { BusyLabel, card, secondaryBtn } from '../common/ui';
import { BackupCodeScreen } from './BackupCodeScreen';
import { defaultDeps, type AuthDeps } from './deps';
import { deleteAccount, signOutAccount } from './flows';
import { useT } from './i18n';
import { Alert, PasswordField, TextField, authError } from './parts';

type Identity = { id: string; provider: 'google' | 'password' | 'email'; display: string };
type Busy = null | 'email-send' | 'email-verify' | 'change' | 'rotate' | 'logout' | 'logout-all' | 'delete' | 'delete-now';
type Msg = { kind: 'ok' | 'error'; text: string } | null;

const dangerBtn = 'min-h-12 w-full rounded-xl bg-danger px-4 font-extrabold text-white disabled:opacity-50';

/**
 * Cài đặt › Tài khoản cho TÀI KHOẢN THẬT: phương thức đã gắn (email che), gắn email, đổi mật khẩu, mã dự phòng,
 * đăng xuất (offline => chờ mạng, có Hủy), đăng xuất mọi thiết bị, xóa tài khoản (30 ngày hoặc "Xóa ngay").
 * Gắn email / đổi mật khẩu / mã dự phòng chỉ có với tài khoản CÓ mật khẩu và đòi mật khẩu hiện tại.
 */
export function AccountPanel({ deps = defaultDeps }: { deps?: AuthDeps }) {
  const t = useT();
  const navigate = useNavigate();
  const [ids, setIds] = useState<Identity[] | null>(null);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const busyRef = useRef(false);
  const mounted = useRef(true);

  // email
  const [email, setEmail] = useState('');
  const [emailPw, setEmailPw] = useState('');
  const [emailSent, setEmailSent] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  // đổi mật khẩu
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  // mã dự phòng
  const [rotPw, setRotPw] = useState('');
  const [newCode, setNewCode] = useState<string | null>(null);
  // xóa
  const [confirmDelete, setConfirmDelete] = useState<null | 'grace' | 'now'>(null);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    mounted.current = true;
    let off: (() => void) | undefined;
    void deps
      .session()
      .then((s) => s.identities())
      .then((l) => mounted.current && setIds(l))
      .catch(() => mounted.current && setIds([]));
    void deps.engine().then((e) => {
      if (!e || !mounted.current) return;
      setStatus(e.status());
      off = e.onStatus((s) => mounted.current && setStatus(s));
    });
    return () => {
      mounted.current = false;
      off?.();
    };
  }, [deps]);

  const hasPassword = ids?.some((i) => i.provider === 'password') ?? false;
  const username = ids?.find((i) => i.provider === 'password')?.display ?? '';

  const run = async (kind: Exclude<Busy, null>, fn: () => Promise<Msg | void>, ctx: 'password' | 'email' | 'auth' = 'password') => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    setMsg(null);
    try {
      const m = await fn();
      if (mounted.current && m) setMsg(m);
    } catch (err) {
      const text = authError(err, t, ctx);
      if (mounted.current && text) setMsg({ kind: 'error', text });
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(null);
    }
  };

  const sendEmail = () => {
    const e = EmailSchema.safeParse(email);
    if (!e.success) return setMsg({ kind: 'error', text: t('errGeneric') });
    void run(
      'email-send',
      async () => {
        await (await deps.session()).startEmailLink(e.data, emailPw);
        setEmailPw('');
        setEmailSent(e.data);
        return { kind: 'ok', text: t('emailSent', { email: e.data }) };
      },
      'email'
    );
  };
  const verifyEmail = () =>
    void run(
      'email-verify',
      async () => {
        setIds(await (await deps.session()).verifyEmailLink(emailSent!, otp));
        setEmailSent(null);
        setEmail('');
        setOtp('');
        return { kind: 'ok', text: t('emailDone') };
      },
      'email'
    );

  const changePassword = () => {
    if (newPw.length < PASSWORD_MIN) return setMsg({ kind: 'error', text: t('errPasswordShort') });
    void run('change', async () => {
      await (await deps.session()).changePassword(curPw, newPw);
      setCurPw('');
      setNewPw('');
      return { kind: 'ok', text: t('changeDone') };
    });
  };

  const rotate = () =>
    void run('rotate', async () => {
      const r = await (await deps.session()).rotateBackupCode(rotPw);
      setRotPw('');
      setNewCode(r.backupCode);
    });

  const logout = (everywhere: boolean) =>
    void run(
      everywhere ? 'logout-all' : 'logout',
      async () => {
        const r = await signOutAccount(deps, everywhere);
        if (r === 'done') navigate('/', { replace: true });
      },
      'auth'
    );

  const word = hasPassword ? username : t('deleteWordGoogle');
  const remove = (mode: 'grace' | 'now') =>
    void run(
      mode === 'now' ? 'delete-now' : 'delete',
      async () => {
        await deleteAccount(deps, mode);
        navigate('/', { replace: true });
      },
      'auth'
    );

  if (newCode) return <BackupCodeScreen code={newCode} fresh onContinue={() => setNewCode(null)} />;

  const label = (i: Identity) => (i.provider === 'google' ? t('provGoogle') : i.provider === 'password' ? t('provPassword') : t('provEmail'));
  const pendingLine = status?.signOutPending ? (status.pending ? t('logoutWaiting', { n: status.pending }) : t('logoutWaitingNone')) : null;
  const syncLine = status ? (status.pending ? t('syncPending', { n: status.pending }) : t('syncOk')) : null;

  return (
    <>
      <section className={card} aria-labelledby="ct-acct-methods">
        <h2 id="ct-acct-methods" className="m-0 text-lg font-extrabold text-ink">
          {t('acctMethods')}
        </h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {(ids ?? []).map((i) => (
            <li key={i.id} className="flex flex-col rounded-xl bg-surface-2 px-3 py-2">
              <span className="text-sm text-ink-muted">{label(i)}</span>
              <span className="font-bold text-ink">{i.display}</span>
            </li>
          ))}
        </ul>
        {syncLine && (
          <p role="status" className="m-0 text-sm text-ink-muted">
            {t('acctSync')}: {syncLine}
          </p>
        )}
      </section>

      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      {hasPassword && (
        <>
          <section className={card} aria-labelledby="ct-acct-email">
            <h2 id="ct-acct-email" className="m-0 text-lg font-extrabold text-ink">
              {t('emailTitle')}
            </h2>
            <p className="m-0 text-sm text-ink-muted">{t('emailHint')}</p>
            {!emailSent ? (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendEmail();
                }}
              >
                <TextField label={t('email')} value={email} onChange={setEmail} type="email" inputMode="email" autoComplete="email" maxLength={254} />
                <PasswordField label={t('currentPassword')} value={emailPw} onChange={setEmailPw} autoComplete="current-password" />
                <button type="submit" className={secondaryBtn} disabled={busy !== null || !email || !emailPw}>
                  <BusyLabel busy={busy === 'email-send'} label={t('emailSend')} busyLabel={t('working')} />
                </button>
              </form>
            ) : (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  verifyEmail();
                }}
              >
                <TextField label={t('codeInput')} value={otp} onChange={setOtp} inputMode="numeric" maxLength={6} mono />
                <button type="submit" className={secondaryBtn} disabled={busy !== null || otp.length !== 6}>
                  <BusyLabel busy={busy === 'email-verify'} label={t('emailVerify')} busyLabel={t('working')} />
                </button>
              </form>
            )}
          </section>

          <section className={card} aria-labelledby="ct-acct-pw">
            <h2 id="ct-acct-pw" className="m-0 text-lg font-extrabold text-ink">
              {t('changeTitle')}
            </h2>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                changePassword();
              }}
            >
              <PasswordField label={t('currentPassword')} value={curPw} onChange={setCurPw} autoComplete="current-password" />
              <PasswordField label={t('newPassword')} value={newPw} onChange={setNewPw} autoComplete="new-password" hint={t('passwordHint')} strength />
              <button type="submit" className={secondaryBtn} disabled={busy !== null || !curPw || !newPw}>
                <BusyLabel busy={busy === 'change'} label={t('changeSubmit')} busyLabel={t('working')} />
              </button>
            </form>
          </section>

          <section className={card} aria-labelledby="ct-acct-backup">
            <h2 id="ct-acct-backup" className="m-0 text-lg font-extrabold text-ink">
              {t('rotateTitle')}
            </h2>
            <p className="m-0 text-sm text-ink-muted">{t('rotateHint')}</p>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                rotate();
              }}
            >
              <PasswordField label={t('currentPassword')} value={rotPw} onChange={setRotPw} autoComplete="current-password" />
              <button type="submit" className={secondaryBtn} disabled={busy !== null || !rotPw}>
                <BusyLabel busy={busy === 'rotate'} label={t('rotateSubmit')} busyLabel={t('working')} />
              </button>
            </form>
          </section>
        </>
      )}

      <section className={card} aria-labelledby="ct-acct-out">
        <h2 id="ct-acct-out" className="m-0 text-lg font-extrabold text-ink">
          {t('logoutTitle')}
        </h2>
        <p className="m-0 text-sm text-ink-muted">{t('logoutHint')}</p>
        {pendingLine ? (
          <>
            <Alert kind="info">{pendingLine}</Alert>
            <button
              type="button"
              className={secondaryBtn}
              onClick={() => {
                void deps.engine().then((e) => e?.cancelSignOut());
              }}
            >
              {t('logoutCancel')}
            </button>
          </>
        ) : (
          <>
            <button type="button" className={secondaryBtn} disabled={busy !== null} onClick={() => logout(false)}>
              <BusyLabel busy={busy === 'logout'} label={t('logoutBtn')} busyLabel={t('working')} />
            </button>
            <button type="button" className={secondaryBtn} disabled={busy !== null} onClick={() => logout(true)}>
              <BusyLabel busy={busy === 'logout-all'} label={t('logoutEverywhere')} busyLabel={t('working')} />
            </button>
          </>
        )}
      </section>

      <section className={card} aria-labelledby="ct-acct-del">
        <h2 id="ct-acct-del" className="m-0 text-lg font-extrabold text-ink">
          {t('deleteTitle')}
        </h2>
        <p className="m-0 text-[15px] text-ink-soft">{t('deleteHint', { days: ACCOUNT_DELETE_GRACE_DAYS })}</p>
        {confirmDelete === null && (
          <>
            <button type="button" className={secondaryBtn} disabled={busy !== null} onClick={() => setConfirmDelete('grace')}>
              {t('deleteGrace', { days: ACCOUNT_DELETE_GRACE_DAYS })}
            </button>
            <button type="button" className={secondaryBtn} disabled={busy !== null} onClick={() => setConfirmDelete('now')}>
              {t('deleteNow')}
            </button>
          </>
        )}
        {confirmDelete === 'grace' && (
          <div role="alert" className="flex flex-col gap-2 rounded-xl bg-danger-soft p-3 text-danger-ink">
            <p className="m-0 text-[15px] font-bold">{t('deleteHint', { days: ACCOUNT_DELETE_GRACE_DAYS })}</p>
            <button type="button" className={dangerBtn} disabled={busy !== null} onClick={() => remove('grace')}>
              <BusyLabel busy={busy === 'delete'} label={t('deleteGrace', { days: ACCOUNT_DELETE_GRACE_DAYS })} busyLabel={t('working')} />
            </button>
            <button type="button" className={secondaryBtn} disabled={busy !== null} onClick={() => setConfirmDelete(null)}>
              {t('cancel')}
            </button>
          </div>
        )}
        {confirmDelete === 'now' && (
          <div className="flex flex-col gap-2 rounded-xl bg-danger-soft p-3 text-danger-ink">
            <p role="alert" className="m-0 text-[15px] font-bold">
              {t('deleteNowAsk', { word })}
            </p>
            <TextField label={t('deleteConfirmField')} value={typed} onChange={setTyped} autoComplete="off" maxLength={64} />
            <button type="button" className={dangerBtn} disabled={busy !== null || typed.trim().toLowerCase() !== word.toLowerCase() || !word} onClick={() => remove('now')}>
              <BusyLabel busy={busy === 'delete-now'} label={t('deleteNowGo')} busyLabel={t('working')} />
            </button>
            <button
              type="button"
              className={secondaryBtn}
              disabled={busy !== null}
              onClick={() => {
                setConfirmDelete(null);
                setTyped('');
              }}
            >
              {t('cancel')}
            </button>
          </div>
        )}
      </section>
    </>
  );
}
