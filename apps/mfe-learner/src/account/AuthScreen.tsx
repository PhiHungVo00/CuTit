import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PASSWORD_MIN, UsernameSchema } from '@vietlearning/contracts/api';
import { CuTit } from '@vietlearning/ui';
import { BusyLabel, ScreenFrame, card, primaryBtn, secondaryBtn } from '../common/ui';
import { BackupCodeScreen } from './BackupCodeScreen';
import { defaultDeps, type AuthDeps } from './deps';
import { ForgotPassword } from './ForgotPassword';
import { continueWithGoogle, loginWithPassword, registerAccount, resolveMerge, type LocalChoice, type SignInOutcome } from './flows';
import { MIN_AGE, useT } from './i18n';
import { MergeDialog, RestoreDialog } from './MergeDialog';
import { Alert, PasswordField, TextField, authError } from './parts';

type Tab = 'login' | 'register';

/**
 * Cổng tuổi: Gateway không cho biết lần Google này tạo tài khoản MỚI hay vào tài khoản cũ, nên hỏi MỘT lần trên mỗi máy
 * trước khi mở Google và nhớ lại (người đã xác nhận, kể cả lúc đăng ký mật khẩu, không bị hỏi nữa).
 */
export const AGE_KEY = 'becutit.age-confirmed';
const ageConfirmed = (): boolean => {
  try {
    return localStorage.getItem(AGE_KEY) === '1';
  } catch {
    return false;
  }
};
const rememberAge = () => {
  try {
    localStorage.setItem(AGE_KEY, '1');
  } catch {
    /* chế độ riêng tư: hỏi lại lần sau */
  }
};
type View =
  | { name: 'form' }
  | { name: 'backup'; code: string }
  | { name: 'forgot' }
  | { name: 'age' }
  /** Đăng nhập mật khẩu trên máy có tiến độ: hỏi gộp hay thay TRƯỚC khi đổi tài khoản */
  | { name: 'local'; username: string; password: string }
  /** Google trả needs_merge: server cấp vé gộp */
  | { name: 'ticket'; ticket: string }
  | { name: 'restore'; deleteAt: string; finish: (restore: boolean) => Promise<void> };

/** Logo Google theo hướng dẫn thương hiệu: nền trắng, viền xám, chữ tối, chữ "G" nhiều màu */
function GoogleG() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/**
 * Màn đăng nhập/đăng ký (route /dang-nhap): Google, tab Đăng nhập/Tạo tài khoản, mã dự phòng, quên mật khẩu, hộp gộp tiến độ.
 * Nguyên tắc: đăng nhập thất bại luôn một câu chung (không lộ tên có tồn tại); đăng ký được báo "tên đã có người dùng".
 */
export function AuthScreen({ deps = defaultDeps, onDone }: { deps?: AuthDeps; onDone?: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('login');
  const [view, setView] = useState<View>({ name: 'form' });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [ageOk, setAgeOk] = useState(false);
  const [busy, setBusy] = useState<null | 'form' | 'google' | 'merge' | 'discard' | 'yes' | 'no'>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ username?: string; password?: string; age?: string }>({});
  const [notice, setNotice] = useState<'noticeMergedElsewhere' | 'noticeSignedOut' | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);

  // Phiên bị chặn (đã gộp ở máy khác / hết hạn): nói rõ vì sao đang ở màn này
  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        const s = await deps.session();
        const info = await s.info();
        if (info && !s.blockedReason()) await s.getToken().catch(() => undefined); // thăm dò: phiên khách còn sống không
        const r = s.blockedReason();
        if (!mounted.current) return;
        setIsGuest(!info || info.kind !== 'account');
        setNotice(r === 'merged_elsewhere' ? 'noticeMergedElsewhere' : r === 'signed_out' ? 'noticeSignedOut' : null);
      } catch {
        /* thiếu mạng: vẫn cho đăng nhập */
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, [deps]);

  const finish = () => (onDone ? onDone() : navigate('/ho-so', { replace: true }));

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>, ctx: 'auth' | 'backup' = 'auth') => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (err) {
      if (mounted.current) setError(authError(err, t, ctx));
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(null);
    }
  };

  const handle = (o: SignInOutcome) => {
    if (o.type === 'done') return finish();
    if (o.type === 'needs_merge') return setView({ name: 'ticket', ticket: o.ticket });
    setView({ name: 'restore', deleteAt: o.deleteAt, finish: o.finish });
  };

  const signInPassword = (choice?: LocalChoice, creds = { username, password }, kind: 'form' | 'merge' | 'discard' = 'form') =>
    run(kind, async () => {
      handle(await loginWithPassword(deps, creds.username, creds.password, choice));
    });

  const submit = async () => {
    const errs: typeof fieldErr = {};
    const u = UsernameSchema.safeParse(username);
    if (!u.success) errs.username = t('errUsernameBad');
    if (tab === 'register' && password.length < PASSWORD_MIN) errs.password = t('errPasswordShort');
    if (tab === 'login' && !password) errs.password = t('errCredentials');
    if (tab === 'register' && !ageOk) errs.age = t('errAge');
    setFieldErr(errs);
    setError(null);
    if (!u.success || errs.password || errs.age) return;
    const name = u.data;
    if (tab === 'register') {
      await run('form', async () => {
        const r = await registerAccount(deps, name, password);
        rememberAge();
        setPassword('');
        setView({ name: 'backup', code: r.backupCode });
      });
      return;
    }
    const s = await deps.session().catch(() => null);
    const info = s ? await s.info().catch(() => null) : null;
    if (s && info?.kind === 'guest' && !s.blockedReason() && deps.hasLocalProgress()) {
      setView({ name: 'local', username: name, password });
      return;
    }
    await signInPassword(undefined, { username: name, password });
  };

  const startGoogle = () =>
    run('google', async () => {
      handle(await continueWithGoogle(deps));
    });
  const google = () => (ageConfirmed() ? startGoogle() : setView({ name: 'age' }));

  const frame = (children: React.ReactNode) => (
    <ScreenFrame title={view.name === 'forgot' ? t('forgotTitle') : t('authTitle')}>{children}</ScreenFrame>
  );

  if (view.name === 'age') {
    return frame(
      <section className={card} aria-labelledby="ct-age-h">
        <h2 id="ct-age-h" className="m-0 text-xl font-extrabold text-heading">
          {t('ageTitle')}
        </h2>
        <p className="m-0 text-[15px] text-ink-soft">{t('ageBody', { age: MIN_AGE })}</p>
        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 border-line bg-surface-2 px-3 py-2 font-bold text-ink">
          <input type="checkbox" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)} className="size-5 accent-[var(--color-accent)]" />
          {t('ageConfirm', { age: MIN_AGE })}
        </label>
        <button
          type="button"
          className={primaryBtn}
          disabled={!ageOk || busy !== null}
          onClick={() => {
            rememberAge();
            setView({ name: 'form' });
            void startGoogle();
          }}
        >
          {t('google')}
        </button>
        <button type="button" className={secondaryBtn} onClick={() => setView({ name: 'form' })}>
          {t('authBack')}
        </button>
      </section>
    );
  }
  if (view.name === 'backup') return frame(<BackupCodeScreen code={view.code} onContinue={finish} />);
  if (view.name === 'forgot') {
    return frame(
      <ForgotPassword
        deps={deps}
        onBack={() => {
          setView({ name: 'form' });
          setTab('login');
        }}
      />
    );
  }
  if (view.name === 'local') {
    return frame(
      <MergeDialog
        busy={busy === 'merge' || busy === 'discard' ? busy : null}
        error={error}
        onCancel={() => {
          setView({ name: 'form' });
          setError(null);
        }}
        onChoose={(c) => {
          const creds = { username: view.username, password: view.password };
          // Sau khi chạy xong mà còn ở hộp này (lỗi) thì người dùng có thể thử lại hoặc hủy
          void signInPassword(c === 'merge' ? 'merge' : 'replace', creds, c);
        }}
      />
    );
  }
  if (view.name === 'ticket') {
    return frame(
      <MergeDialog
        busy={busy === 'merge' || busy === 'discard' ? busy : null}
        error={error}
        onCancel={() => {
          setView({ name: 'form' });
          setError(null);
        }}
        onChoose={(c) => void run(c, async () => handle(await resolveMerge(deps, view.ticket, c === 'merge' ? 'merge' : 'discard_device')))}
      />
    );
  }
  if (view.name === 'restore') {
    return frame(
      <RestoreDialog
        deleteAt={view.deleteAt}
        busy={busy === 'yes' || busy === 'no' ? busy : null}
        error={error}
        onRestore={() =>
          void run('yes', async () => {
            await view.finish(true);
            finish();
          })
        }
        onDecline={() =>
          void run('no', async () => {
            await view.finish(false);
            setView({ name: 'form' });
          })
        }
      />
    );
  }

  const isRegister = tab === 'register';
  return frame(
    <>
      <div className="flex items-center gap-3">
        <CuTit mood="chao" size={88} alt="" />
        <p className="m-0 text-[15px] text-ink-soft">{isGuest && !notice ? t('authGuestHint') : t('authIntro')}</p>
      </div>
      {notice && <Alert kind="info">{t(notice)}</Alert>}

      <section className={card} aria-label={t('tabsLabel')}>
        {deps.googleAvailable() && (
          <>
            <button
              type="button"
              onClick={() => void google()}
              disabled={busy !== null}
              className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-[#747775] bg-white px-4 font-bold text-[#1f1f1f] disabled:opacity-60"
            >
              <GoogleG />
              {busy === 'google' ? t('googleBusy') : t('google')}
            </button>
            <p aria-hidden="true" className="m-0 flex items-center gap-3 text-sm text-ink-muted before:h-px before:flex-1 before:bg-line-strong after:h-px after:flex-1 after:bg-line-strong">
              {t('or')}
            </p>
          </>
        )}

        <div role="group" aria-label={t('tabsLabel')} className="grid grid-cols-2 gap-2">
          {(['login', 'register'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={tab === k}
              onClick={() => {
                setTab(k);
                setError(null);
                setFieldErr({});
              }}
              className={`min-h-12 rounded-xl border-2 px-2 font-bold ${tab === k ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface-2 text-ink-soft'}`}
            >
              {k === 'login' ? t('tabLogin') : t('tabRegister')}
            </button>
          ))}
        </div>

        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <TextField
            label={t('username')}
            value={username}
            onChange={setUsername}
            autoComplete="username"
            maxLength={64}
            hint={isRegister ? t('usernameHint') : undefined}
            error={fieldErr.username}
          />
          <PasswordField
            label={t('password')}
            value={password}
            onChange={setPassword}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            hint={isRegister ? t('passwordHint') : undefined}
            error={fieldErr.password}
            strength={isRegister}
          />
          {isRegister && (
            <div className="flex flex-col gap-1">
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 border-line bg-surface-2 px-3 py-2 font-bold text-ink">
                <input type="checkbox" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)} className="size-5 accent-[var(--color-accent)]" />
                {t('ageConfirm', { age: MIN_AGE })}
              </label>
              {fieldErr.age && (
                <p role="alert" className="m-0 text-sm font-bold text-danger-ink">
                  {fieldErr.age}
                </p>
              )}
            </div>
          )}
          {error && <Alert>{error}</Alert>}
          <button type="submit" className={primaryBtn} disabled={busy !== null}>
            <BusyLabel busy={busy === 'form'} label={isRegister ? t('submitRegister') : t('submitLogin')} busyLabel={t('working')} />
          </button>
        </form>

        {!isRegister && (
          <button type="button" className={secondaryBtn} disabled={busy !== null} onClick={() => setView({ name: 'forgot' })}>
            {t('forgotLink')}
          </button>
        )}
      </section>
    </>
  );
}
