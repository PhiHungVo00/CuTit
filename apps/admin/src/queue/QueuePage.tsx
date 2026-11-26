import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@vietlearning/ui';
import type { AdminClient } from '@vietlearning/api-client/admin';
import type { AdminFeedbackDetail, FeedbackKind, FeedbackStatus, QueueItem, StaffRoleValue } from '@vietlearning/contracts/api';
import { useI18n } from '../i18n.js';
import { errorText } from '../session.js';
import { DetailPanel } from './DetailPanel.js';

const STATUSES: FeedbackStatus[] = ['received', 'in_progress', 'done'];
const KINDS: FeedbackKind[] = ['bug', 'idea', 'other'];

/** Hàng chờ góp ý: lọc theo trạng thái/loại, phân trang theo con trỏ ("Tải thêm"), chọn dòng ⇒ chi tiết bên cạnh. */
export function QueuePage({ client, roles }: { client: AdminClient; roles: readonly StaffRoleValue[] }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<FeedbackStatus | ''>('');
  const [kind, setKind] = useState<FeedbackKind | ''>('');
  const [items, setItems] = useState<QueueItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Bỏ kết quả của lần tải cũ khi bộ lọc đổi nhanh
  const seq = useRef(0);

  const load = useCallback(
    async (after: string | null) => {
      const mine = ++seq.current;
      setLoading(true);
      setError(null);
      try {
        const r = await client.queue({ status: status || undefined, kind: kind || undefined, cursor: after ?? undefined });
        if (mine !== seq.current) return;
        setItems((prev) => {
          if (!after) return r.items;
          const seen = new Set(prev.map((i) => i.id));
          return [...prev, ...r.items.filter((i) => !seen.has(i.id))];
        });
        setCursor(r.nextCursor);
        setPending(r.pendingCount);
      } catch (e) {
        if (mine === seq.current) setError(errorText(t, e));
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [client, status, kind, t]
  );

  useEffect(() => {
    setItems([]);
    setCursor(null);
    void load(null);
  }, [load]);

  const onUpdated = (d: AdminFeedbackDetail) => {
    setItems((prev) => prev.map((i) => (i.id === d.id ? { ...i, status: d.status } : i)));
    // làm mới số "chưa xong" từ server (đúng hơn là tự cộng trừ)
    client
      .queue({ limit: 1 })
      .then((r) => setPending(r.pendingCount))
      .catch(() => undefined);
  };

  return (
    <div className="split">
      <section aria-labelledby="queue-h" className="list">
        <div className="row between">
          <h1 id="queue-h">{t('queueTitle')}</h1>
          {pending !== null ? <span className="badge" role="status">{t('pending', { n: pending })}</span> : null}
        </div>
        <div className="filters">
          <label>
            {t('filterStatus')}
            <select value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus | '')}>
              <option value="">{t('all')}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{t(`status_${s}`)}</option>
              ))}
            </select>
          </label>
          <label>
            {t('filterKind')}
            <select value={kind} onChange={(e) => setKind(e.target.value as FeedbackKind | '')}>
              <option value="">{t('all')}</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>{t(`kind_${k}`)}</option>
              ))}
            </select>
          </label>
        </div>
        {error ? (
          <div role="alert" className="error">
            {error} <button type="button" className="linklike" onClick={() => void load(null)}>{t('retry')}</button>
          </div>
        ) : null}
        <ul className="items">
          {items.map((i) => (
            <li key={i.id}>
              <button type="button" className="item" aria-current={selected === i.id ? 'true' : undefined} onClick={() => setSelected(i.id)}>
                <span className="row between">
                  <span className={`chip kind-${i.kind}`}>{t(`kind_${i.kind}`)}</span>
                  <span className={`chip st-${i.status}`}>{t(`status_${i.status}`)}</span>
                </span>
                {/* nội dung người dùng chỉ ra dạng văn bản thuần: React tự thoát ký tự, không có HTML thô */}
                <span className="excerpt">{i.excerpt}</span>
                <span className="muted small">
                  {new Date(i.createdAt).toLocaleString()} · v{i.appVersion}
                  {i.fileCount > 0 ? ` · ${t('files', { n: i.fileCount })}` : ''}
                  {i.accountPendingDeletion ? ` · ${t('deletionPending')}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {!loading && !error && items.length === 0 ? <p className="muted">{t('queueEmpty')}</p> : null}
        {loading ? <p role="status" className="muted">{t('loading')}</p> : null}
        {cursor && !loading ? (
          <Button variant="secondary" onClick={() => void load(cursor)}>{t('loadMore')}</Button>
        ) : null}
      </section>
      <section aria-live="polite" className="detail">
        {selected ? <DetailPanel key={selected} client={client} id={selected} roles={roles} onUpdated={onUpdated} /> : <p className="muted">{t('selectPrompt')}</p>}
      </section>
    </div>
  );
}
