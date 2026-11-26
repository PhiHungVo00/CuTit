import { useCallback, useEffect, useState } from 'react';
import { Button } from '@vietlearning/ui';
import type { AdminClient } from '@vietlearning/api-client/admin';
import type { AuditEntry } from '@vietlearning/contracts/api';
import { useI18n } from '../i18n.js';
import { errorText } from '../session.js';

/** Nhật ký quản trị (chỉ owner): mới nhất lên đầu, "Tải thêm" theo con trỏ. `meta` chỉ hiện dạng văn bản thuần. */
export function AuditPage({ client }: { client: AdminClient }) {
  const { t } = useI18n();
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (after: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const r = await client.audit({ cursor: after ?? undefined });
        setItems((prev) => (after ? [...prev, ...r.items] : r.items));
        setCursor(r.nextCursor);
      } catch (e) {
        setError(errorText(t, e));
      } finally {
        setLoading(false);
      }
    },
    [client, t]
  );
  useEffect(() => {
    void load(null);
  }, [load]);

  return (
    <section aria-labelledby="audit-h" className="card wide">
      <h1 id="audit-h">{t('auditTitle')}</h1>
      {error ? (
        <div role="alert" className="error">
          {error} <button type="button" className="linklike" onClick={() => void load(null)}>{t('retry')}</button>
        </div>
      ) : null}
      {items.length > 0 ? (
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('auditTime')}</th>
                <th scope="col">{t('auditActor')}</th>
                <th scope="col">{t('auditAction')}</th>
                <th scope="col">{t('auditTarget')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.at).toLocaleString()}</td>
                  <td>{e.actorUserIdShort ?? (e.actorKind === 'cli' ? t('cli') : '—')}</td>
                  <td><code>{e.action}</code></td>
                  <td>
                    {e.targetType}
                    {e.targetId ? ` · ${e.targetId}` : ''}
                    {Object.keys(e.meta).length ? <span className="muted small"> {JSON.stringify(e.meta)}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !loading && !error ? (
        <p className="muted">{t('auditEmpty')}</p>
      ) : null}
      {loading ? <p role="status" className="muted">{t('loading')}</p> : null}
      {cursor && !loading ? <Button variant="secondary" onClick={() => void load(cursor)}>{t('loadMore')}</Button> : null}
    </section>
  );
}
