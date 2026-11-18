import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PitchReferenceFlyweight, type ExerciseRef } from '@vietlearning/content';
import { getDeviceSpeech } from '@vietlearning/native';
import { dueCards, learnerStore, speechRate, useLearner, useUiLanguage, type SrsCard } from '@vietlearning/state';
import { lessonXp, progressStore, reviewXp, useProgress } from '@vietlearning/state/progress';
import { useT } from './i18n';
import { weakestTone } from './path/pathModel';
import { mistakeRefs, toneDrill } from './review/reviewModel';
import { SessionRunner } from './session/SessionRunner';
import { card, Page, primaryBtn, secondaryBtn } from './ui';

const GRADES = [1, 3, 5] as const;

/** Ôn thẻ đến hạn (A4): xem mặt trước → lật → tự chấm Quên/Khó/Nhớ */
function CardReview({ cards, onClose }: { cards: SrsCard[]; onClose(): void }) {
  const t = useT();
  const [queue] = useState(cards);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [remembered, setRemembered] = useState(0);
  const [xp, setXp] = useState<number | null>(null);
  const cur = queue[i];

  const grade = (q: number) => {
    learnerStore.getState().reviewCard(cur.itemRef, q);
    const n = remembered + (q >= 3 ? 1 : 0);
    setRemembered(n);
    setFlipped(false);
    if (i + 1 >= queue.length) {
      const gained = reviewXp(n);
      progressStore.getState().addXp(gained);
      setXp(gained);
    }
    setI(i + 1);
  };

  if (!cur) {
    return (
      <section role="status" className={`${card} items-center text-center`}>
        <h2 className="m-0 text-xl font-black text-heading">{t('reviewDone', { n: remembered, total: queue.length, xp: xp ?? 0 })}</h2>
        <button type="button" className={primaryBtn} onClick={onClose}>
          {t('done')}
        </button>
      </section>
    );
  }
  return (
    <section className={card} aria-labelledby="ct-card-front">
      <p className="m-0 text-xs font-bold uppercase tracking-wide text-ink-muted">{t('cardOf', { i: i + 1, n: queue.length })}</p>
      <h2 id="ct-card-front" lang="vi" className="m-0 break-words text-center text-2xl font-black text-heading">
        {cur.front}
      </h2>
      <button type="button" className={secondaryBtn} onClick={() => getDeviceSpeech().speak(cur.front, { rate: speechRate(0.85) }).catch(() => undefined)}>
        🔈
      </button>
      {!flipped ? (
        <button type="button" className={primaryBtn} onClick={() => setFlipped(true)}>
          {t('flip')}
        </button>
      ) : (
        <>
          <p lang="vi" className="m-0 break-words rounded-xl bg-surface-2 p-3 text-center text-lg text-ink">
            {cur.back}
          </p>
          <div role="group" aria-label={t('gradeQ')} className="grid grid-cols-3 gap-2">
            {GRADES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => grade(q)}
                className={['min-h-12 rounded-xl border-2 font-bold', q === 1 ? 'border-danger bg-danger-soft text-danger-ink' : 'border-line bg-surface-2 text-ink'].join(' ')}
              >
                {t(`grade.${q}`)}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

type Mode = { kind: 'menu' } | { kind: 'cards'; cards: SrsCard[] } | { kind: 'practice'; refs: ExerciseRef[]; seedKey: string } | { kind: 'practiceDone'; xp: number };

/** Khu Ôn tập /on-tap: thẻ SRS đến hạn, lỗi gần đây, thanh điệu yếu nhất. Mở tự do, không cần học xong bài nào. */
export function ReviewScreen() {
  const t = useT();
  const en = useUiLanguage() === 'en';
  const srs = useLearner((s) => s.srs);
  const mistakes = useProgress((s) => s.mistakes);
  const toneStats = useProgress((s) => s.toneStats);
  const [mode, setMode] = useState<Mode>({ kind: 'menu' });
  const back = () => setMode({ kind: 'menu' });

  if (mode.kind === 'cards') {
    return (
      <Page>
        <CardReview cards={mode.cards} onClose={back} />
      </Page>
    );
  }
  if (mode.kind === 'practice') {
    return (
      <Page>
        <SessionRunner
          refs={mode.refs}
          seedKey={mode.seedKey}
          title={t('reviewTitle')}
          onClose={back}
          onFinish={(o) => {
            const xp = lessonXp(o);
            progressStore.getState().addXp(xp);
            setMode({ kind: 'practiceDone', xp });
          }}
        />
      </Page>
    );
  }

  const due = dueCards(srs);
  const recent = mistakeRefs(mistakes);
  const weak = weakestTone(toneStats);
  const weakRef = weak ? PitchReferenceFlyweight.get(weak) : null;
  const weakName = weakRef ? (en ? weakRef.nameEn : weakRef.name).toLowerCase() : '';
  const weakAvg = weak ? Math.round(toneStats[weak].sum / toneStats[weak].n) : 0;

  return (
    <Page>
      <header className="flex flex-col gap-2 border-b-2 border-line pb-4">
        <h1 className="m-0 text-[26px] font-black leading-tight tracking-tight text-heading">{t('reviewTitle')}</h1>
        <p className="m-0 text-[15px] text-ink-soft">{t('reviewIntro')}</p>
      </header>
      {mode.kind === 'practiceDone' && (
        <p role="status" className="m-0 rounded-xl bg-accent-soft p-3 font-bold text-heading">
          {t('practiceDone', { xp: mode.xp })}
        </p>
      )}

      <section aria-labelledby="ct-due" className={card}>
        <h2 id="ct-due" className="m-0 text-lg font-extrabold text-ink">
          🗂️ {t('dueTitle')} ({due.length})
        </h2>
        {due.length ? (
          <button type="button" className={primaryBtn} onClick={() => setMode({ kind: 'cards', cards: due })}>
            {t('dueStart', { n: due.length })}
          </button>
        ) : (
          <p className="m-0 text-sm text-ink-soft">{t('dueEmpty')}</p>
        )}
      </section>

      <section aria-labelledby="ct-mistakes" className={card}>
        <h2 id="ct-mistakes" className="m-0 text-lg font-extrabold text-ink">
          ✏️ {t('mistakesTitle')} ({recent.length})
        </h2>
        {recent.length ? (
          <button type="button" className={secondaryBtn} onClick={() => setMode({ kind: 'practice', refs: recent, seedKey: `mistakes-${mistakes.length}`})}>
            {t('mistakesStart', { n: recent.length })}
          </button>
        ) : (
          <p className="m-0 text-sm text-ink-soft">{t('mistakesEmpty')}</p>
        )}
      </section>

      <section aria-labelledby="ct-tone" className={card}>
        <h2 id="ct-tone" className="m-0 text-lg font-extrabold text-ink">
          🎙️ {t('toneTitle')}
        </h2>
        {weak ? (
          <>
            <p className="m-0 text-sm text-ink-soft">{t('toneWeak', { tone: weakName, avg: weakAvg })}</p>
            <button type="button" className={secondaryBtn} onClick={() => setMode({ kind: 'practice', refs: toneDrill(weak), seedKey: `tone-${weak}`})}>
              {t('toneStart', { tone: weakName })}
            </button>
          </>
        ) : (
          <>
            <p className="m-0 text-sm text-ink-soft">{t('toneEmpty')}</p>
            <Link to="/phat-am" className={secondaryBtn}>
              {t('toneLab')}
            </Link>
          </>
        )}
      </section>
    </Page>
  );
}
