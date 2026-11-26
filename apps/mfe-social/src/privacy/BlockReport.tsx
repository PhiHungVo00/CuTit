import { useState } from 'react';
import type { ReportCreate } from '@vietlearning/contracts/api';
import type { SocialClient } from '../client/types';
import { errCode } from '../client/errors';
import { useT } from '../i18n';
import { card, input, Notice, primaryBtn, secondaryBtn } from '../ui';

type Reason = ReportCreate['reason'];
const REASONS: Reason[] = ['spam', 'harassment', 'sexual', 'minor_safety', 'scam', 'other'];

/**
 * Bảng chặn / báo cáo của một cuộc trò chuyện 1-1. Chặn có xác nhận (xóa bạn, không nhắn riêng nữa); báo cáo chọn lý do
 * (không bắt buộc ghi chú) và chỉ nói "đã gửi", không cho biết gì về xử lý.
 */
export function BlockReport({ client, cid, peer, onClose, onBlocked }: { client: SocialClient; cid: string; peer: { id: string; displayName: string }; onClose: () => void; onBlocked: () => void }) {
  const t = useT();
  const [view, setView] = useState<'menu' | 'block' | 'report' | 'sent'>('menu');
  const [reason, setReason] = useState<Reason | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const doBlock = async () => {
    setBusy(true);
    setErr(null);
    try {
      await client.rest.blockUser(peer.id);
      onBlocked();
    } catch {
      setBusy(false);
      setErr(t('failed'));
    }
  };
  const doReport = async () => {
    if (!reason) return;
    setBusy(true);
    setErr(null);
    try {
      await client.rest.report({ conversationId: cid, reportedUserId: peer.id, reason, ...(note.trim() ? { note: note.trim() } : {}) });
      setView('sent');
    } catch (e) {
      setErr(errCode(e) === 'report_limit' ? t('safety.limit') : t('failed'));
    }
    setBusy(false);
  };

  return (
    <section role="dialog" aria-modal="false" aria-label={t('safety.menu')} className={card}>
      {view === 'menu' && (
        <>
          <button type="button" className={secondaryBtn} onClick={() => setView('report')}>
            {t('safety.report')}
          </button>
          <button type="button" className={secondaryBtn} onClick={() => setView('block')}>
            {t('safety.block')}
          </button>
          <button type="button" className="min-h-11 font-bold text-ink-soft" onClick={onClose}>
            {t('safety.cancel')}
          </button>
        </>
      )}
      {view === 'block' && (
        <>
          <p className="m-0 text-[15px] text-ink">{t('safety.blockConfirm', { name: peer.displayName })}</p>
          {err && <Notice tone="error">{err}</Notice>}
          <button type="button" className={primaryBtn} disabled={busy} onClick={() => void doBlock()}>
            {t('safety.blockYes')}
          </button>
          <button type="button" className="min-h-11 font-bold text-ink-soft" onClick={onClose}>
            {t('safety.cancel')}
          </button>
        </>
      )}
      {view === 'report' && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void doReport();
          }}
        >
          <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className="mb-1 p-0 text-[15px] font-bold text-ink-soft">{t('safety.reportTitle', { name: peer.displayName })}</legend>
            {REASONS.map((r) => (
              <label key={r} className="flex min-h-11 items-center gap-3 text-[15px] text-ink">
                <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="size-5" />
                {t(`safety.reason.${r}` as 'safety.reason.spam')}
              </label>
            ))}
          </fieldset>
          <label htmlFor="report-note" className="text-sm text-ink-soft">
            {t('safety.note')}
          </label>
          <textarea id="report-note" className={input + ' min-h-20 py-2'} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          {err && <Notice tone="error">{err}</Notice>}
          <button type="submit" className={primaryBtn} disabled={!reason || busy}>
            {t('safety.send')}
          </button>
          <button type="button" className="min-h-11 font-bold text-ink-soft" onClick={onClose}>
            {t('safety.cancel')}
          </button>
        </form>
      )}
      {view === 'sent' && (
        <>
          <Notice>{t('safety.sent')}</Notice>
          <button type="button" className={secondaryBtn} onClick={onClose}>
            {t('back')}
          </button>
        </>
      )}
    </section>
  );
}
