import { learnerStore, useLearner } from '@vietlearning/state';
import { useT } from '../i18n';
import type { SummaryItem } from './summaryItems';

const addCard = (i: SummaryItem) => learnerStore.getState().addCard({ itemRef: i.key, front: i.front, back: i.back, source: 'conversation' });

/** Lỗi hay gặp + từ mới của buổi nói/nhập vai: mỗi mục chạm một lần thành thẻ ôn tập SM-2 (không tự lưu). */
export function SessionSummary({ items }: { items: SummaryItem[] }) {
  const t = useT();
  const srs = useLearner((s) => s.srs);
  const mistakes = items.filter((i) => i.kind === 'mistake');
  const words = items.filter((i) => i.kind === 'word');
  const pending = items.filter((i) => !srs[i.key]);

  if (items.length === 0) return <p className="m-0 text-[15px] text-ink-soft">{t('nothingToReview')}</p>;

  const row = (i: SummaryItem) => {
    const added = Boolean(srs[i.key]);
    return (
      <li key={i.key} className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3">
        <p className="m-0 text-[15px]">
          <strong lang="vi">{i.front}</strong>
          <span className="text-ink-soft"> · {i.back}</span>
        </p>
        <button
          type="button"
          disabled={added}
          onClick={() => addCard(i)}
          aria-label={added ? `${i.front}: ${t('added')}` : `${t('addToReview')}: ${i.front}`}
          className={`min-h-11 self-start rounded-xl px-3 text-sm font-bold ${added ? 'bg-surface text-ink-muted' : 'border border-line-strong bg-surface text-ink'}`}
        >
          {added ? t('added') : t('addToReview')}
        </button>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {mistakes.length > 0 && (
        <section aria-labelledby="ct-sum-mistakes" className="flex flex-col gap-2">
          <h3 id="ct-sum-mistakes" className="m-0 text-lg font-extrabold text-ink">
            {t('mistakes', { n: mistakes.length })}
          </h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">{mistakes.map(row)}</ul>
        </section>
      )}
      {words.length > 0 && (
        <section aria-labelledby="ct-sum-words" className="flex flex-col gap-2">
          <h3 id="ct-sum-words" className="m-0 text-lg font-extrabold text-ink">
            {t('newWordsTitle', { n: words.length })}
          </h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">{words.map(row)}</ul>
        </section>
      )}
      {pending.length > 1 && (
        <button type="button" onClick={() => pending.forEach(addCard)} className="min-h-12 rounded-xl border border-line-strong bg-surface-2 px-4 font-bold text-ink">
          {t('addAll', { n: pending.length })}
        </button>
      )}
      <p className="m-0 text-sm text-ink-muted">{t('srsHint')}</p>
    </div>
  );
}
