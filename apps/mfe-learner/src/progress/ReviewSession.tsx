import { useEffect, useRef, useState } from 'react';
import { learnerStore, type SrsCard } from '@vietlearning/state';
import { playSfx } from '@vietlearning/shared/audio';
import { Button, Card, CuTit, type CuTitMood } from '@vietlearning/ui';
import { SlowListen, say as sayAt } from '../listen';
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
  const [mood, setMood] = useState<CuTitMood>('chan-dung');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const current = queue[index];

  useEffect(() => {
    headingRef.current?.focus();
  }, [index, flipped]);

  const grade = (q: number) => {
    learnerStore.getState().reviewCard(current.itemRef, q);
    const ok = q >= 3;
    if (ok) setRemembered((r) => r + 1);
    // Cuối lượt: một âm hoàn thành thay cho âm đúng/sai (tránh hai âm chồng nhau)
    if (index + 1 >= queue.length) {
      playSfx('hoan-thanh');
      setMood('an-mung');
    } else {
      playSfx(ok ? 'dung' : 'sai');
      setMood(ok ? 'khen' : 'dong-vien');
    }
    setFlipped(false);
    setIndex((i) => i + 1);
  };

  const cardStyle = { display: 'flex', flexDirection: 'column', gap: 12 } as const;

  if (!current) {
    return (
      <Card role="status" elevated style={{ ...cardStyle, alignItems: 'center', textAlign: 'center' }}>
        <CuTit mood="an-mung" size={120} />
        <h2 ref={headingRef} tabIndex={-1} className="m-0 text-xl font-black text-ink outline-none">
          {t('reviewDone', { n: remembered, total: queue.length })}
        </h2>
        <p className="m-0 text-[15px] text-ink-soft">{t('reviewDoneHint')}</p>
        <Button onClick={onClose} style={{ width: '100%' }}>
          {t('done')}
        </Button>
      </Card>
    );
  }

  return (
    <Card role="region" aria-labelledby="ct-review-front" elevated style={cardStyle}>
      <div className="flex items-center gap-3">
        <CuTit mood={mood} size={56} />
        <p className="m-0 text-xs font-bold uppercase tracking-wide text-ink-muted">{t('reviewProgress', { i: index + 1, total: queue.length })}</p>
      </div>
      <h2 id="ct-review-front" ref={headingRef} tabIndex={-1} lang="vi" className="m-0 text-center text-3xl font-black text-heading outline-none">
        {current.front}
      </h2>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => say(current.front)} style={{ flex: 1 }}>
          {t('listen')}
        </Button>
        <SlowListen text={current.front} base={BASE} />
      </div>
      {!flipped ? (
        <Button onClick={() => setFlipped(true)} style={{ width: '100%' }}>
          {t('flip')}
        </Button>
      ) : (
        <>
          <p className="m-0 rounded-xl bg-surface-2 p-3 text-center text-lg text-ink" lang="vi">
            {current.back}
          </p>
          <div role="group" aria-label={t('gradeQ')} className="grid grid-cols-4 gap-2">
            {GRADES.map((g) => (
              <Button
                key={g.q}
                variant={g.q < 3 ? 'danger' : 'secondary'}
                onClick={() => grade(g.q)}
                style={{ flexDirection: 'column', gap: 2, minHeight: 56, padding: '0 4px', fontSize: '0.95rem' }}
              >
                {t(`grade.${g.q}`)}
                {g.hint && <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.85 }}>{t(`grade.${g.q}.hint` as 'grade.1.hint')}</span>}
              </Button>
            ))}
          </div>
        </>
      )}
      <Button variant="ghost" onClick={onClose}>
        {t('stopReview')}
      </Button>
    </Card>
  );
}
