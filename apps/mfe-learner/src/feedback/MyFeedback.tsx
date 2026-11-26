import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@vietlearning/ui';
import type { FeedbackStatus, MyFeedback as MyFeedbackItem } from '@vietlearning/contracts/api';
import { listMyFeedback, markFeedbackRead } from '@vietlearning/api-client/feedback';
import { useUiLanguage } from '@vietlearning/state';
import { ScreenFrame, linkBtn, secondaryBtn } from '../common/ui';
import { useT } from '../i18n';
import { useFeedbackUnread } from './useFeedbackUnread';

type MsgKey = Parameters<ReturnType<typeof useT>>[0];

const firstLine = (s: string) => s.split('\n')[0]!;

/** "Góp ý của tôi": danh sách + dòng thời gian lời nhắn của chủ app; mở một mục chưa đọc thì đánh dấu đã đọc. */
export function MyFeedback() {
  const t = useT();
  const lang = useUiLanguage();
  const { refresh } = useFeedbackUnread();
  const [items, setItems] = useState<MyFeedbackItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    setItems(null);
    listMyFeedback().then((r) => setItems(r.items), () => setFailed(true));
  }, []);
  useEffect(load, [load]);

  const date = (iso: string) => new Date(iso).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB');
  const statusLabel = (s: FeedbackStatus) => t(`fbStatus.${s}` as MsgKey);

  const toggle = (it: MyFeedbackItem) => {
    const opening = openId !== it.id;
    setOpenId(opening ? it.id : null);
    if (opening && it.unread) {
      setItems((l) => l?.map((x) => (x.id === it.id ? { ...x, unread: false } : x)) ?? l);
      markFeedbackRead(it.id).then(refresh, () => undefined);
    }
  };

  const back = (
    <Link to="/gop-y" className={linkBtn}>
      {t('fbBackToForm')}
    </Link>
  );

  return (
    <ScreenFrame title={t('fbMineTitle')} action={back}>
      {failed && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-line-strong bg-surface p-4">
          <p className="m-0 text-[15px] text-ink">{t('fbLoadErr')}</p>
          <button type="button" className={secondaryBtn} onClick={load}>
            {t('retry')}
          </button>
        </div>
      )}
      {!failed && items === null && (
        <p role="status" className="m-0 text-ink-muted">
          {t('fbLoading')}
        </p>
      )}
      {items?.length === 0 && (
        <EmptyState
          mood="ngu"
          title={t('fbEmpty')}
          body={t('fbEmptyHint')}
          action={
            <Link to="/gop-y" className={linkBtn + ' justify-center'}>
              {t('fbNew')}
            </Link>
          }
        />
      )}
      {items && items.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((it) => {
            const open = openId === it.id;
            return (
              <li key={it.id} className="overflow-hidden rounded-2xl border border-line-strong bg-surface">
                <button type="button" aria-expanded={open} onClick={() => toggle(it)} className="flex min-h-14 w-full flex-col gap-1 border-0 bg-transparent p-3 text-left font-[inherit] text-ink">
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-extrabold text-heading">{t(`fbKind.${it.kind}` as MsgKey)}</span>
                    <span className="text-ink-muted">{date(it.createdAt)}</span>
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-ink">{statusLabel(it.status)}</span>
                    {it.unread && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-ink">
                        <span aria-hidden="true" className="inline-block rounded-full" style={{ width: 10, height: 10, background: '#C0553A' }} />
                        {t('fbUnread')}
                      </span>
                    )}
                  </span>
                  <span className={open ? 'text-[15px]' : 'truncate text-[15px]'}>{open ? it.body : firstLine(it.body)}</span>
                </button>
                {open && (
                  <div className="flex flex-col gap-2 border-t border-line px-3 pb-3 pt-2">
                    {it.files.length > 0 && <p className="m-0 text-sm text-ink-muted">{it.files.some((f) => f.purged) ? t('fbFilesPurged') : t('fbFiles', { n: it.files.length })}</p>}
                    <h3 className="m-0 text-sm font-extrabold text-ink-soft">{t('fbTimeline')}</h3>
                    {it.events.length === 0 ? (
                      <p className="m-0 text-sm text-ink-muted">{t('fbNoReply')}</p>
                    ) : (
                      <ol className="m-0 flex list-none flex-col gap-2 p-0">
                        {it.events.map((ev, i) => (
                          <li key={i} className="rounded-xl bg-surface-2 p-2 text-sm text-ink">
                            <span className="block text-xs text-ink-muted">
                              {date(ev.at)}
                              {ev.status ? ` · ${statusLabel(ev.status)}` : ''}
                            </span>
                            {ev.message && (
                              <span className="block">
                                <b>{t('fbOwner')}:</b> {ev.message}
                              </span>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ScreenFrame>
  );
}
