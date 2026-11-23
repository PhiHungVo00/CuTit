import { useEffect, useRef } from 'react';
import { card, primaryBtn, secondaryBtn, BusyLabel } from '../common/ui';
import { Alert } from './parts';
import { useT } from './i18n';

/** Hộp chọn khi máy này đã có tiến độ và tài khoản đích cũng có: gộp, hoặc chỉ dùng tiến độ của tài khoản. */
export function MergeDialog({
  busy,
  error,
  onChoose,
  onCancel
}: {
  busy: 'merge' | 'discard' | null;
  error?: string | null;
  onChoose: (choice: 'merge' | 'discard') => void;
  onCancel: () => void;
}) {
  const t = useT();
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => head.current?.focus(), []);
  return (
    <section role="alertdialog" aria-modal="false" className={card} aria-labelledby="ct-merge-h" aria-describedby="ct-merge-b">
      <h2 id="ct-merge-h" ref={head} tabIndex={-1} className="m-0 text-xl font-extrabold text-heading">
        {t('mergeTitle')}
      </h2>
      <p id="ct-merge-b" className="m-0 text-[15px] text-ink-soft">
        {t('mergeBody')}
      </p>
      <button type="button" className={primaryBtn} disabled={busy !== null} onClick={() => onChoose('merge')}>
        <BusyLabel busy={busy === 'merge'} label={t('mergeKeep')} busyLabel={t('working')} />
      </button>
      <p className="m-0 text-sm text-ink-muted">{t('mergeKeepHint')}</p>
      <button type="button" className={secondaryBtn} disabled={busy !== null} onClick={() => onChoose('discard')}>
        <BusyLabel busy={busy === 'discard'} label={t('mergeDiscard')} busyLabel={t('working')} />
      </button>
      <p className="m-0 text-sm text-ink-muted">{t('mergeDiscardHint')}</p>
      {error && <Alert>{error}</Alert>}
      <button type="button" className={secondaryBtn} disabled={busy !== null} onClick={onCancel}>
        {t('mergeCancel')}
      </button>
    </section>
  );
}

/** "Khôi phục tài khoản?" — tài khoản đang trong 30 ngày chờ xóa */
export function RestoreDialog({
  deleteAt,
  busy,
  error,
  onRestore,
  onDecline
}: {
  deleteAt: string;
  busy: 'yes' | 'no' | null;
  error?: string | null;
  onRestore: () => void;
  onDecline: () => void;
}) {
  const t = useT();
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => head.current?.focus(), []);
  const date = new Date(deleteAt).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
  return (
    <section role="alertdialog" aria-modal="false" className={card} aria-labelledby="ct-restore-h" aria-describedby="ct-restore-b">
      <h2 id="ct-restore-h" ref={head} tabIndex={-1} className="m-0 text-xl font-extrabold text-heading">
        {t('restoreTitle')}
      </h2>
      <p id="ct-restore-b" className="m-0 text-[15px] text-ink-soft">
        {t('restoreBody', { date })}
      </p>
      <button type="button" className={primaryBtn} disabled={busy !== null} onClick={onRestore}>
        <BusyLabel busy={busy === 'yes'} label={t('restoreYes')} busyLabel={t('working')} />
      </button>
      {error && <Alert>{error}</Alert>}
      <button type="button" className={secondaryBtn} disabled={busy !== null} onClick={onDecline}>
        <BusyLabel busy={busy === 'no'} label={t('restoreNo')} busyLabel={t('working')} />
      </button>
    </section>
  );
}
