import { useEffect, useRef, useState } from 'react';
import { learnerStore, type SrsCard } from '@vietlearning/state';
import { SlowListen, say as sayAt } from '../listen';
import { card, primaryBtn, secondaryBtn } from '../common/ui';
import { useT } from '../i18n';

/** 4 mức tự chấm => chất lượng SM-2 (A4). <3 là quên: thẻ quay lại từ đầu. */
const GRADES = [
  { q: 1, hint: true },
  { q: 3, hint: true },
  { q: 4, hint: false },
  { q: 5, hint: true }
] as const;

/** Đọc theo tốc độ người học chọn ở M12 */
const BASE = 0.85;
const say = (text: string) => sayAt(text, BASE);

/** Phiên ôn thẻ đến hạn: xem mặt trước → lật → tự chấm. Danh sách cố định lúc bắt đầu phiên. */
export function ReviewSession({ cards, onClose }: { cards: SrsCard[]; onClose: () => void }) {
  const t = useT();
  const [queue] = useState(cards);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [remembered, setRemembered] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const current = queue[index];

  useEffect(() => {
    headingRef.current?.focus();
  }, [index, flipped]);

  const grade = (q: number) => {
    learnerStore.getState().reviewCard(current.itemRef, q);
    if (q >= 3) setRemembered((r) => r + 1);
    setFlipped(false);
    setIndex((i) => i + 1);
  };

  if (!current) {
    return (
      <section role="status" className={`${card} items-center text-center`}>
        <span aria-hidden="true" className="text-5xl">
          🎋
        </span>
        <h2 ref={headingRef} tabIndex={-1} className="m-0 text-xl font-black text-ink outline-none">
          {t('reviewDone', { n: remembered, total: queue.length })}
        </h2>
        <p className="m-0 text-[15px] text-ink-soft">{t('reviewDoneHint')}</p>
        <button type="button" className={primaryBtn} onClick={onClose}>
          {t('done')}
        </button>
      </section>
    );
  }

  return (
    <section className={card} aria-labelledby="ct-review-front">
      <p className="m-0 text-xs font-bold uppercase tracking-wide text-ink-muted">{t('reviewProgress', { i: index + 1, total: queue.length })}</p>
      <h2 id="ct-review-front" ref={headingRef} tabIndex={-1} lang="vi" className="m-0 text-center text-3xl font-black text-heading outline-none">
        {current.front}
      </h2>
      <div className="flex gap-2">
        <button type="button" className={`${secondaryBtn} flex-1`} onClick={() => say(current.front)}>
          {t('listen')}
        </button>
        <SlowListen text={current.front} base={BASE} className="min-h-12 min-w-12 shrink-0 rounded-xl border border-line bg-surface-2 px-3 text-lg" />
      </div>
      {!flipped ? (
        <button type="button" className={primaryBtn} onClick={() => setFlipped(true)}>
          {t('flip')}
        </button>
      ) : (
        <>
          <p className="m-0 rounded-xl bg-surface-2 p-3 text-center text-lg text-ink" lang="vi">
            {current.back}
          </p>
          <div role="group" aria-label={t('gradeQ')} className="grid grid-cols-4 gap-2">
            {GRADES.map((g) => (
              <button
                key={g.q}
                type="button"
                onClick={() => grade(g.q)}
                className={['flex min-h-14 flex-col items-center justify-center rounded-xl border-2 px-1 font-bold', g.q < 3 ? 'border-danger bg-danger-soft text-danger-ink' : 'border-line bg-surface-2 text-ink'].join(' ')}
              >
                {t(`grade.${g.q}`)}
                {g.hint && <span className="text-[11px] font-normal text-ink-muted">{t(`grade.${g.q}.hint` as 'grade.1.hint')}</span>}
              </button>
            ))}
          </div>
        </>
      )}
      <button type="button" className="min-h-11 text-sm font-bold text-ink-muted underline" onClick={onClose}>
        {t('stopReview')}
      </button>
    </section>
  );
}
