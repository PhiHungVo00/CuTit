import { useState, type ReactNode } from 'react';
import { EmptyState } from '@vietlearning/ui';
import type { SocialClient } from '../client/types';
import { useT } from '../i18n';
import { useMe } from '../state/useSocial';
import { ScreenFrame, linkBtn, secondaryBtn, primaryBtn } from '../ui';
import { AgeGate, MinorNotice } from './AgeGate';
import { HandleSetup } from './HandleSetup';

type Bad = { status: 'loading' } | { status: 'error'; offline: boolean; unavailable: boolean };

/** Màn thông báo trạng thái chung (đang tải / lỗi / ngoại tuyến / chưa mở): không bao giờ để màn trắng. */
export function StatusScreen({ title, state, onRetry, back }: { title: string; state: Bad; onRetry: () => void; back?: string }) {
  const t = useT();
  if (state.status === 'loading')
    return (
      <ScreenFrame title={title} back={back}>
        <EmptyState mood="suy-nghi" title={t('loading')} />
      </ScreenFrame>
    );
  const text = state.unavailable ? t('unavailable') : state.offline ? t('offline') : t('failed');
  return (
    <ScreenFrame title={title} back={back}>
      <EmptyState
        mood="buon"
        tone="error"
        title={text}
        action={
          state.unavailable ? (
            <a href="/" className={primaryBtn + ' flex items-center justify-center no-underline'}>
              {t('backToLearn')}
            </a>
          ) : (
            <button type="button" className={secondaryBtn} onClick={onRetry}>
              {t('retry')}
            </button>
          )
        }
      />
    </ScreenFrame>
  );
}

/**
 * Cổng điều kiện dùng chat: một `switch` trên `ineligible` của Gateway (khách: mời tạo tài khoản; chưa khai tuổi: cổng tuổi;
 * dưới 18: màn giải thích; chưa có handle: đặt tên; bị khóa/chờ xóa: giải thích). Đủ điều kiện mới vẽ `children`.
 */
export function Gate({ client, title, children }: { client: SocialClient; title: string; children: ReactNode }) {
  const t = useT();
  const me = useMe(client);
  const [minor, setMinor] = useState(false);
  if (me.state.status !== 'ready') return <StatusScreen title={title} state={me.state} onRetry={me.reload} back="/ho-so" />;
  const d = me.state.data;
  if (minor || d.ineligible === 'minor') return <MinorNotice />;
  switch (d.ineligible) {
    case 'guest':
      return (
        <ScreenFrame title={title} back="/ho-so">
          <EmptyState
            mood="ngu"
            title={t('gate.guestTitle')}
            body={t('gate.guestBody')}
            action={
              <a href="/dang-nhap" className={linkBtn + ' justify-center bg-accent text-accent-ink'}>
                {t('gate.guestCta')}
              </a>
            }
          />
        </ScreenFrame>
      );
    case 'age_unknown':
      return <AgeGate client={client} onDone={(adult) => (adult ? me.reload() : setMinor(true))} />;
    case 'no_handle':
      return <HandleSetup client={client} suggested={d.suggestedHandle} onDone={me.reload} />;
    case 'restricted':
      return (
        <ScreenFrame title={title} back="/ho-so">
          <EmptyState mood="buon" title={t('gate.restrictedTitle')} body={t('gate.restrictedBody')} />
        </ScreenFrame>
      );
    case 'pending_deletion':
      return (
        <ScreenFrame title={title} back="/ho-so">
          <EmptyState mood="buon" title={t('gate.pendingTitle')} body={t('gate.pendingBody')} />
        </ScreenFrame>
      );
    default:
      return <>{children}</>;
  }
}
