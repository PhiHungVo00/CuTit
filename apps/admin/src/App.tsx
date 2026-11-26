import { useCallback, useEffect, useState } from 'react';
import { Button } from '@vietlearning/ui';
import type { AdminSessionInfo } from '@vietlearning/contracts/api';
import { useI18n } from './i18n.js';
import { can, errorText, type SessionHandle } from './session.js';
import { LoginPage } from './auth/LoginPage.js';
import { QueuePage } from './queue/QueuePage.js';
import { AuditPage } from './audit/AuditPage.js';

type Phase = { t: 'boot' } | { t: 'bootError'; message: string } | { t: 'login'; notice?: 'expired' | 'loggedOut' } | { t: 'main'; info: AdminSessionInfo };
type View = 'queue' | 'audit';

/**
 * Khung trang quản trị. Khởi động: thử khôi phục phiên từ cookie refresh (tải lại trang không hỏi lại mã).
 * Phiên chấm dứt giữa chừng (refresh hỏng) ⇒ `handle.onExpired` ⇒ về màn đăng nhập kèm thông báo.
 */
export function App({ handle }: { handle: SessionHandle }) {
  const { t, toggle } = useI18n();
  const { client } = handle;
  const [phase, setPhase] = useState<Phase>({ t: 'boot' });
  const [view, setView] = useState<View>('queue');

  const boot = useCallback(async () => {
    setPhase({ t: 'boot' });
    try {
      if (!(await client.restore())) return setPhase({ t: 'login' });
      setPhase({ t: 'main', info: await client.session() });
    } catch (e) {
      // `session-expired` đã được onExpired xử lý (đổi sang màn đăng nhập)
      setPhase((p) => (p.t === 'login' ? p : { t: 'bootError', message: errorText(t, e) }));
    }
  }, [client, t]);

  useEffect(() => {
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => handle.onExpired(() => setPhase({ t: 'login', notice: 'expired' })), [handle]);

  const finishLogin = useCallback(async () => {
    try {
      setPhase({ t: 'main', info: await client.session() });
    } catch (e) {
      setPhase({ t: 'bootError', message: errorText(t, e) });
    }
  }, [client, t]);

  const logout = async () => {
    try {
      await client.logout();
    } catch {
      /* mạng lỗi vẫn thoát ở máy này; cookie sẽ tự hết hạn */
    }
    setView('queue');
    setPhase({ t: 'login', notice: 'loggedOut' });
  };

  let body;
  if (phase.t === 'boot') body = <p role="status" className="center muted">{t('loading')}</p>;
  else if (phase.t === 'bootError')
    body = (
      <main className="card narrow">
        <p role="alert" className="error">{phase.message}</p>
        <Button size="lg" onClick={() => void boot()}>{t('retry')}</Button>
      </main>
    );
  else if (phase.t === 'login')
    body = <LoginPage client={client} notice={phase.notice === 'expired' ? t('noticeExpired') : phase.notice === 'loggedOut' ? t('noticeLoggedOut') : undefined} onDone={() => void finishLogin()} />;
  else {
    const { roles, userIdShort } = phase.info;
    const showAudit = can.viewAudit(roles);
    body = (
      <>
        <nav className="tabs" aria-label={t('appName')}>
          <button type="button" aria-current={view === 'queue' ? 'page' : undefined} onClick={() => setView('queue')}>
            {t('navQueue')}
          </button>
          {showAudit ? (
            <button type="button" aria-current={view === 'audit' ? 'page' : undefined} onClick={() => setView('audit')}>
              {t('navAudit')}
            </button>
          ) : null}
          <span className="spacer" />
          <span className="muted small">{t('signedInAs', { id: userIdShort, roles: roles.join(', ') })}</span>
          <button type="button" className="linklike" onClick={() => void logout()}>
            {t('logout')}
          </button>
        </nav>
        {view === 'audit' && showAudit ? <AuditPage client={client} /> : <QueuePage client={client} roles={roles} />}
      </>
    );
  }

  return (
    <div className="shell">
      <header className="top">
        <strong>{t('appName')}</strong>
        <button type="button" className="linklike" onClick={toggle} lang={t('langSwitch') === 'English' ? 'en' : 'vi'}>
          {t('langSwitch')}
        </button>
      </header>
      {body}
    </div>
  );
}
