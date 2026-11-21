import type { ReactNode } from 'react';
import { useT as useLearnerT } from '../i18n';
import type { Sync } from './usePrefs';

/** Khung hàng của ListRow: bo góc, viền như thẻ */
export function Rows({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div role="group" aria-label={label} className="overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-card">
      {children}
    </div>
  );
}

export function SyncLine({ sync }: { sync: Sync }) {
  const t = useLearnerT();
  return (
    <p role="status" className="m-0 min-h-5 text-sm text-ink-muted">
      {sync === 'saving' && t('saving')}
      {sync === 'synced' && t('synced')}
      {sync === 'local' && t('localOnly')}
    </p>
  );
}
