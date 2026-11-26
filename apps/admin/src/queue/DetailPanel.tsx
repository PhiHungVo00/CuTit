import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button } from '@vietlearning/ui';
import type { AdminClient } from '@vietlearning/api-client/admin';
import { FEEDBACK_LIMITS, type AdminFeedbackDetail, type FeedbackStatus, type StaffRoleValue } from '@vietlearning/contracts/api';
import { useI18n } from '../i18n.js';
import { can, errorText } from '../session.js';

const STATUSES: FeedbackStatus[] = ['received', 'in_progress', 'done'];

/** Chi tiết một góp ý: nội dung (văn bản thuần), bối cảnh, tệp đính kèm (URL ký), lịch sử, đổi trạng thái + lời nhắn. */
export function DetailPanel({ client, id, roles, onUpdated }: { client: AdminClient; id: string; roles: readonly StaffRoleValue[]; onUpdated: (d: AdminFeedbackDetail) => void }) {
  const { t } = useI18n();
  const [detail, setDetail] = useState<AdminFeedbackDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let live = true;
    setError(null);
    client
      .detail(id)
      .then((d) => live && setDetail(d))
      .catch((e) => live && setError(errorText(t, e)));
    return () => {
      live = false;
    };
  }, [client, id, t]);
  useEffect(() => load(), [load]);

  if (error)
    return (
      <div role="alert" className="error">
        {error} <button type="button" className="linklike" onClick={() => load()}>{t('retry')}</button>
      </div>
    );
  if (!detail) return <p role="status" className="muted">{t('loading')}</p>;

  const ctx = detail.context;
  return (
    <article aria-labelledby="detail-h" className="card">
      <h2 id="detail-h">{t('detailTitle')}</h2>
      <p className="row gap">
        <span className={`chip kind-${detail.kind}`}>{t(`kind_${detail.kind}`)}</span>
        <span className={`chip st-${detail.status}`}>{t(`status_${detail.status}`)}</span>
        <span className="muted small">{t('fromUser', { id: detail.userIdShort })} · {new Date(detail.createdAt).toLocaleString()}</span>
        {detail.accountPendingDeletion ? <span className="chip st-warn">{t('deletionPending')}</span> : null}
      </p>
      {/* văn bản thuần, giữ xuống dòng bằng CSS (white-space: pre-wrap); KHÔNG dùng dangerouslySetInnerHTML */}
      <p className="body-text">{detail.body}</p>

      <h3>{t('context')}</h3>
      <dl className="ctx">
        <dt>{t('ctxVersion')}</dt>
        <dd>{ctx.appVersion} ({ctx.build})</dd>
        <dt>{t('ctxPlatform')}</dt>
        <dd>{ctx.platform} · {ctx.osVersion} · {ctx.locale}</dd>
        <dt>{t('ctxRoute')}</dt>
        <dd>{ctx.route}{ctx.recentRoutes.length ? ` ← ${ctx.recentRoutes.join(' ← ')}` : ''}</dd>
        {ctx.error ? (
          <>
            <dt>{t('ctxError')}</dt>
            <dd>{ctx.error.name}: {ctx.error.firstFrame}</dd>
          </>
        ) : null}
      </dl>

      {detail.files.length > 0 ? (
        <>
          <h3>{t('attachments')}</h3>
          <div className="files">
            {detail.files.map((f, i) => (
              <FileView key={f.id} client={client} feedbackId={detail.id} file={f} index={i + 1} allowed={can.viewFiles(roles)} />
            ))}
          </div>
        </>
      ) : null}

      {detail.events.length > 0 ? (
        <>
          <h3>{t('timeline')}</h3>
          <ol className="timeline">
            {detail.events.map((e, i) => (
              <li key={i}>
                <span className="muted small">{new Date(e.at).toLocaleString()}</span>{' '}
                {e.status ? <span className={`chip st-${e.status}`}>{t(`status_${e.status}`)}</span> : null}{' '}
                {e.message ? <span className="body-text">{e.message}</span> : null}
              </li>
            ))}
          </ol>
        </>
      ) : null}

      <StatusForm key={detail.id} client={client} detail={detail} canChange={can.changeStatus(roles)} onSaved={(d) => (setDetail(d), onUpdated(d))} />
    </article>
  );
}

type FileInfo = AdminFeedbackDetail['files'][number];
type Url = { s: 'loading' } | { s: 'ready'; url: string } | { s: 'error'; message: string };

/**
 * Tệp đính kèm: xin URL ký (5 phút) rồi hiện bằng `<img>` hoặc `<video controls>` TRỰC TIẾP từ URL đó.
 * Không bao giờ tải nội dung về để chèn vào trang, không `<iframe>/<object>/<embed>`, không HTML/SVG người dùng:
 * Gateway chỉ phát đúng 3 loại ảnh raster + 3 loại video và trang quản trị (CSP) chỉ cho `img-src`/`media-src` tới Gateway.
 * Hết hạn / lỗi tải ⇒ nút "Tải lại tệp" xin URL mới.
 */
function FileView({ client, feedbackId, file, index, allowed }: { client: AdminClient; feedbackId: string; file: FileInfo; index: number; allowed: boolean }) {
  const { t } = useI18n();
  const [u, setU] = useState<Url>({ s: 'loading' });
  const [nonce, setNonce] = useState(0);
  const label = file.media === 'image' ? t('fileImage', { n: index }) : t('fileVideo', { n: index });

  useEffect(() => {
    if (file.purged || !allowed) return;
    let live = true;
    setU({ s: 'loading' });
    client
      .fileUrl(feedbackId, file.id)
      .then((r) => live && setU({ s: 'ready', url: r.url }))
      .catch((e) => live && setU({ s: 'error', message: errorText(t, e) }));
    return () => {
      live = false;
    };
  }, [client, feedbackId, file.id, file.purged, allowed, nonce, t]);

  if (file.purged) return <p className="muted">{label}: {t('filePurged')}</p>;
  if (!allowed) return <p className="muted">{label}: {t('errForbidden')}</p>;
  if (u.s === 'loading') return <p role="status" className="muted">{label}: {t('fileLoading')}</p>;
  if (u.s === 'error')
    return (
      <p role="alert" className="error">
        {label}: {u.message} <button type="button" className="linklike" onClick={() => setNonce((n) => n + 1)}>{t('fileReload')}</button>
      </p>
    );
  const reload = (
    <button type="button" className="linklike" onClick={() => setNonce((n) => n + 1)}>{t('fileReload')}</button>
  );
  return (
    <figure className="file">
      {file.media === 'image' ? (
        <img src={u.url} alt={label} referrerPolicy="no-referrer" loading="lazy" onError={() => setU({ s: 'error', message: t('errGone') })} />
      ) : (
        <video src={u.url} controls preload="metadata" playsInline onError={() => setU({ s: 'error', message: t('errGone') })} aria-label={label} />
      )}
      <figcaption className="muted small">{label} · {reload}</figcaption>
    </figure>
  );
}

function StatusForm({ client, detail, canChange, onSaved }: { client: AdminClient; detail: AdminFeedbackDetail; canChange: boolean; onSaved: (d: AdminFeedbackDetail) => void }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<FeedbackStatus>(detail.status);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const trimmed = message.trim();
  const unchanged = status === detail.status && !trimmed;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (unchanged || !canChange) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const d = await client.setStatus(detail.id, { status, ...(trimmed ? { message: trimmed } : {}) });
      setMessage('');
      setSaved(true);
      onSaved(d);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="status-form" noValidate>
      {!canChange ? <p className="muted">{t('readOnly')}</p> : null}
      <label>
        {t('statusLabel')}
        <select value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus)} disabled={!canChange || busy}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{t(`status_${s}`)}</option>
          ))}
        </select>
      </label>
      <label>
        {t('messageLabel')}
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={FEEDBACK_LIMITS.replyMax} rows={3} disabled={!canChange || busy} />
        <span className="muted small">{t('messageCount', { n: [...message].length, max: FEEDBACK_LIMITS.replyMax })}</span>
      </label>
      {error ? <p role="alert" className="error">{error}</p> : null}
      {saved ? <p role="status" className="ok">{t('saved')}</p> : null}
      <Button type="submit" busy={busy} disabled={!canChange || unchanged}>{t('saveBtn')}</Button>
    </form>
  );
}
