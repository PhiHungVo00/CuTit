import { useUiLanguage } from '@vietlearning/state';
import type { Message } from '../client/types';
import { useT } from '../i18n';
import type { Pending } from '../state/useSocial';

const time = (iso: string, lang: 'vi' | 'en') => new Date(iso).toLocaleTimeString(lang === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
const chip = 'min-h-11 rounded-xl px-2 text-sm font-bold text-accent-text';

/** Một tin của máy chủ: thường / đã thu hồi / của người đã chặn / có tệp. Tin của mình có Thu hồi, tin vừa thu hồi có Hoàn tác. */
export function MessageBubble({ m, onRecall, onRestore }: { m: Message; onRecall?: (id: string) => void; onRestore?: (id: string) => void }) {
  const t = useT();
  const lang = useUiLanguage();
  if (m.blocked)
    return (
      <li className="self-start rounded-2xl border border-dashed border-line-strong px-3 py-2 text-sm italic text-ink-muted">{t('chat.blockedMsg')}</li>
    );
  if (m.deleted)
    return (
      <li className={['flex flex-col gap-1 rounded-2xl border border-dashed border-line-strong px-3 py-2 text-sm italic text-ink-muted', m.mine ? 'self-end' : 'self-start'].join(' ')}>
        <span>{m.mine ? t('chat.recalledMine') : t('chat.recalledTheirs')}</span>
        {m.mine && onRestore && (
          <button type="button" className={chip + ' self-start not-italic'} onClick={() => onRestore(m.id)}>
            {t('chat.restore')}
          </button>
        )}
      </li>
    );
  const label = m.kind === 'image' ? t('list.image') : m.kind === 'voice' ? t('list.voice') : (m.body ?? t('chat.attachment'));
  return (
    <li className={['flex max-w-[82%] flex-col gap-1', m.mine ? 'items-end self-end' : 'items-start self-start'].join(' ')}>
      {!m.mine && m.sender && <span className="px-1 text-sm text-ink-muted">{m.sender.displayName}</span>}
      <p className={['m-0 whitespace-pre-wrap break-words rounded-2xl border px-3 py-2 text-[15px]', m.mine ? 'border-accent bg-accent-soft text-ink' : 'border-line-strong bg-surface text-ink'].join(' ')}>{label}</p>
      <span className="flex items-center gap-2 px-1 text-sm text-ink-muted">
        <time dateTime={m.createdAt}>{time(m.createdAt, lang)}</time>
        {m.mine && onRecall && (
          <button type="button" className={chip} onClick={() => onRecall(m.id)}>
            {t('chat.recall')}
          </button>
        )}
      </span>
    </li>
  );
}

/** Tin chờ gửi / lỗi gửi (chỉ ở máy này): "Đang gửi…" hoặc "Không gửi được" + Gửi lại / Bỏ. */
export function PendingBubble({ p, onResend, onDiscard }: { p: Pending; onResend: (id: string) => void; onDiscard: (id: string) => void }) {
  const t = useT();
  const why = p.error === 'rate' ? t('chat.rate') : p.error === 'notMember' ? t('chat.notMember') : p.error === 'blocked' ? t('chat.blockedSend') : t('chat.cannotSend');
  return (
    <li className="flex max-w-[82%] flex-col items-end gap-1 self-end">
      <p className="m-0 whitespace-pre-wrap break-words rounded-2xl border border-accent bg-accent-soft px-3 py-2 text-[15px] text-ink opacity-80">{p.body}</p>
      {p.status === 'sending' ? (
        <span role="status" className="px-1 text-sm text-ink-muted">
          {t('chat.sending')}
        </span>
      ) : (
        <span role="alert" className="flex flex-wrap items-center justify-end gap-2 px-1 text-sm font-bold text-ink">
          <span>{t('chat.failed')}. {why}</span>
          <button type="button" className={chip} onClick={() => onResend(p.localId)}>
            {t('chat.resend')}
          </button>
          <button type="button" className={chip + ' text-ink-soft'} onClick={() => onDiscard(p.localId)}>
            {t('chat.discard')}
          </button>
        </span>
      )}
    </li>
  );
}
