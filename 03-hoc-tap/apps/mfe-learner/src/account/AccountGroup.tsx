import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { card, primaryBtn } from '../common/ui';
import { AccountSection, type AccountDeps } from '../preferences/AccountSection';
import { AccountPanel } from './AccountPanel';
import { defaultDeps, type AuthDeps } from './deps';
import { useT as useAccountT } from './i18n';

/** Nội dung nhóm Cài đặt › Tài khoản (nạp lười từ settings/groups/TaiKhoan): tài khoản thật => AccountPanel; khách => lời mời đăng nhập + mã khôi phục/đồng bộ như trước. */
export function AccountGroup({ deps, authDeps = defaultDeps }: { deps?: AccountDeps; authDeps?: AuthDeps }) {
  const t = useAccountT();
  const navigate = useNavigate();
  const [kind, setKind] = useState<'guest' | 'account' | null>(null);

  useEffect(() => {
    let live = true;
    void authDeps
      .session()
      .then((s) => s.info())
      .then((i) => live && setKind(i?.kind === 'account' ? 'account' : 'guest'))
      .catch(() => live && setKind('guest'));
    return () => {
      live = false;
    };
  }, [authDeps]);

  if (kind === null) return null;
  if (kind === 'account') return <AccountPanel deps={authDeps} />;
  return (
    <>
      <section className={card} aria-labelledby="ct-guest-acct">
        <h2 id="ct-guest-acct" className="m-0 text-lg font-extrabold text-ink">
          {t('guestAcctTitle')}
        </h2>
        <p className="m-0 text-[15px] text-ink-soft">{t('guestAcctBody')}</p>
        <button type="button" className={primaryBtn} onClick={() => navigate('/dang-nhap')}>
          {t('profileSignIn')}
        </button>
      </section>
      <AccountSection deps={deps} />
    </>
  );
}
