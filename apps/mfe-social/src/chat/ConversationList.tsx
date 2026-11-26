import { Link } from 'react-router-dom';
import { EmptyState } from '@vietlearning/ui';
import { useUiLanguage } from '@vietlearning/state';
import type { Conversation, SocialClient } from '../client/types';
import { useT } from '../i18n';
import { useConnState, useConversationList } from '../state/useSocial';
import { Gate, StatusScreen } from '../privacy/Gate';
import { ScreenFrame, linkBtn, Notice } from '../ui';
import { ConnectionBar } from './ConnectionBar';

export const convName = (c: Conversation, fallback: string) => c.peer?.displayName ?? c.title ?? fallback;

function Row({ c, lang }: { c: Conversation; lang: 'vi' | 'en' }) {
  const t = useT();
  const name = convName(c, t('list.group'));
  const lm = c.lastMessage;
  const preview = !lm ? t('list.noMessages') : lm.kind === 'image' ? t('list.image') : lm.kind === 'voice' ? t('list.voice') : (lm.preview ?? t('list.recalled'));
  const when = lm ? new Date(lm.createdAt).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB', { day: 'numeric', month: 'numeric' }) : '';
  return (
    <li className="border-b border-line last:border-b-0">
      <Link to={`/tin-nhan/${c.id}`} className="flex min-h-14 items-center gap-3 px-3 py-2 text-ink no-underline">
        <span aria-hidden="true" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft font-bold text-accent-text">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className={'block truncate ' + (c.unread > 0 ? 'font-black' : 'font-bold')}>{name}</span>
          <span className="block truncate text-sm text-ink-soft">{preview}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 text-sm text-ink-muted">
          <span>{when}</span>
          {c.unread > 0 && (
            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-accent px-1.5 font-bold text-accent-ink">
              <span aria-hidden="true">{c.unread}</span>
              <span className="sr-only">{t('list.unread', { n: c.unread })}</span>
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

function List({ client }: { client: SocialClient }) {
  const t = useT();
  const lang = useUiLanguage();
  const conn = useConnState(client);
  const { state, reload } = useConversationList(client);
  const add = (
    <Link to="/ban-be/tim" className={linkBtn + ' bg-accent text-accent-ink'}>
      {t('list.addFriend')}
    </Link>
  );
  if (state.status !== 'ready') return <StatusScreen title={t('list.title')} state={state} onRetry={reload} back="/ho-so" />;
  const items = state.data;
  return (
    <ScreenFrame title={t('list.title')} back="/ho-so" action={items.length > 0 ? add : undefined}>
      <ConnectionBar state={conn} />
      {items.length === 0 ? (
        <EmptyState mood="ngu" title={t('list.empty')} body={t('list.emptyHint')} action={add} />
      ) : (
        <ul aria-label={t('list.title')} className="m-0 list-none overflow-hidden rounded-2xl border border-line-strong bg-surface p-0 shadow-card">
          {items.map((c) => (
            <Row key={c.id} c={c} lang={lang} />
          ))}
        </ul>
      )}
      <Link to="/ban-be/tim" className="text-sm font-bold text-accent-text">
        {t('list.requests')}
      </Link>
      {typeof navigator !== 'undefined' && navigator.onLine === false && <Notice>{t('offline')}</Notice>}
    </ScreenFrame>
  );
}

/** Danh sách cuộc trò chuyện (`/tin-nhan`) — đi qua cổng tuổi/handle trước. */
export function ChatListScreen({ client }: { client: SocialClient }) {
  const t = useT();
  return (
    <Gate client={client} title={t('list.title')}>
      <List client={client} />
    </Gate>
  );
}
