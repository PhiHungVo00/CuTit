import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@vietlearning/ui';
import type { SocialClient } from '../client/types';
import { errCode, isOffline } from '../client/errors';
import { useT } from '../i18n';
import { ScreenFrame, card, input, linkBtn, Notice, primaryBtn } from '../ui';

const CODE_RE = /^[A-Z0-9]{8}$/;
const clean = (s: string) => s.replace(/[\s-]/g, '').toUpperCase();

/**
 * Nhập mã mời (`/moi/:code`): điền sẵn mã từ link `becutit://moi/<MÃ>`. Luồng mã mời có sẵn (kết bạn ngay) mở cho cả khách
 * và người dưới 18 nên KHÔNG qua cổng tuổi; chỉ chat mới cần.
 */
export function InviteScreen({ client, code }: { client: SocialClient; code?: string }) {
  const t = useT();
  const [value, setValue] = useState(clean(code ?? ''));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [friend, setFriend] = useState<string | null>(null);

  const submit = async () => {
    const c = clean(value);
    if (!CODE_RE.test(c)) return setErr(t('invite.err.invite_invalid'));
    setBusy(true);
    setErr(null);
    try {
      const r = await client.rest.acceptInvite(c);
      setFriend(r.friend.displayName);
    } catch (e) {
      const k = errCode(e);
      const known = ['invite_invalid', 'self_invite', 'already_friends', 'friend_limit', 'display_name_required'];
      setErr(known.includes(k ?? '') ? t(`invite.err.${k}` as 'invite.err.other') : isOffline(e) ? t('offline') : t('invite.err.other'));
    }
    setBusy(false);
  };

  if (friend)
    return (
      <ScreenFrame title={t('invite.title')} back="/ban-be">
        <EmptyState
          mood="khen"
          title={t('invite.ok', { name: friend })}
          action={
            <Link to="/ban-be" className={linkBtn + ' justify-center bg-accent text-accent-ink'}>
              {t('invite.toFriends')}
            </Link>
          }
        />
      </ScreenFrame>
    );

  return (
    <ScreenFrame title={t('invite.title')} back="/ban-be">
      <form
        className={card}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="invite-code" className="text-[15px] font-bold text-ink-soft">
          {t('invite.label')}
        </label>
        <input id="invite-code" className={input + ' font-mono uppercase tracking-widest'} value={value} maxLength={12} autoCapitalize="characters" autoCorrect="off" spellCheck={false} aria-describedby="invite-hint" onChange={(e) => setValue(e.target.value)} />
        <p id="invite-hint" className="m-0 text-sm text-ink-muted">
          {t('invite.hint')}
        </p>
        {err && <Notice tone="error">{err}</Notice>}
        <button type="submit" className={primaryBtn} disabled={busy || !value.trim()}>
          {busy ? t('invite.working') : t('invite.submit')}
        </button>
      </form>
    </ScreenFrame>
  );
}
