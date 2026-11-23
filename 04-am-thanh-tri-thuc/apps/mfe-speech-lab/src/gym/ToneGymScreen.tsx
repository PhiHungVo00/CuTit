import { useEffect, useMemo, useRef, useState } from 'react';
import { PitchReferenceFlyweight, TONE_SETS, type ToneId } from '@vietlearning/content';
import { playText, prefetchPack } from '@vietlearning/exercises';
import { playSfx } from '@vietlearning/shared/audio';
import { useLearner } from '@vietlearning/state';
import { Button, CuTit, Icon } from '@vietlearning/ui';
import { useProgress } from '@vietlearning/state/progress';
import { useT } from './i18n';
import { gymStore, useGymByDay } from './gymStore';
import { START_MS, TONES, catchToneRound, minimalPairQuestion, nextTimeLimit, toneProgress } from './toneGymModel';

type Tab = 'pairs' | 'catch' | 'progress';
const btn = 'min-h-12 rounded-xl border border-line bg-surface px-3 text-base font-bold text-ink disabled:opacity-60';

/** seed cố định qua ?seed= (e2e), không có thì theo thời gian */
function initialSeed(): number {
  const s = Number(new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('seed'));
  return Number.isFinite(s) && s > 0 ? s : Date.now() % 2147483646;
}

function useToneName() {
  const en = useLearner((s) => s.preferences.uiLanguage) === 'en';
  return (id: ToneId) => (en ? PitchReferenceFlyweight.get(id).nameEn : PitchReferenceFlyweight.get(id).name).toLowerCase();
}

function MinimalPairs({ seed }: { seed: number }) {
  const t = useT();
  const toneName = useToneName();
  const [i, setI] = useState(0);
  const q = useMemo(() => minimalPairQuestion(seed + i), [seed, i]);
  const [chosen, setChosen] = useState<ToneId | null>(null);

  useEffect(() => {
    void playText(q.word);
  }, [q]);

  const choose = (tone: ToneId) => {
    if (chosen) return;
    setChosen(tone);
    playSfx(tone === q.answer ? 'dung' : 'sai');
    gymStore.record(q.answer, tone === q.answer);
  };
  const set = TONE_SETS.find((s) => s.id === q.setId)!;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 text-lg font-extrabold text-ink">{t('pairsQ')}</p>
        <Button variant="secondary" onClick={() => void playText(q.word)}>
          <Icon name="loa" size={18} />
          {t('listen')}
        </Button>
      </div>
      <div role="group" aria-label={t('options')} className="grid grid-cols-3 gap-2" lang="vi">
        {q.options.map((o) => (
          <button
            key={o.tone}
            type="button"
            disabled={chosen !== null}
            onClick={() => choose(o.tone)}
            className={[btn, 'text-2xl', chosen && o.tone === q.answer ? 'border-accent bg-accent-soft' : '', chosen === o.tone && o.tone !== q.answer ? 'border-danger bg-danger-soft' : ''].join(' ')}
          >
            {o.vi}
          </button>
        ))}
      </div>
      <p className="m-0 text-xs text-ink-muted">{t('noAudio')}</p>
      {chosen && (
        <div role="status" className="flex flex-col gap-2 rounded-xl border border-line bg-sunken p-3">
          <div className="flex items-center gap-2">
            <CuTit mood={chosen === q.answer ? 'khen' : 'dong-vien'} size={56} />
            <strong className={chosen === q.answer ? 'text-heading' : 'text-danger'}>{chosen === q.answer ? t('right') : t('wrong', { word: q.word })}</strong>
          </div>
          <ul className="m-0 list-none p-0 text-sm text-ink-soft">
            {q.options.map((o) => (
              <li key={o.tone}>{t('meaning', { word: o.vi, tone: toneName(o.tone), en: set.forms[o.tone]!.en })}</li>
            ))}
          </ul>
          <Button
            onClick={() => {
              setChosen(null);
              setI((x) => x + 1);
            }}
          >
            {t('nextQ')}
          </Button>
        </div>
      )}
    </div>
  );
}

const ROUND = 10;

function CatchTone({ seed }: { seed: number }) {
  const t = useT();
  const toneName = useToneName();
  const [game, setGame] = useState(0);
  const round = useMemo(() => catchToneRound(seed + 1000 * game, ROUND), [seed, game]);
  const [started, setStarted] = useState(false);
  const [i, setI] = useState(0);
  const [limit, setLimit] = useState(START_MS);
  const [left, setLeft] = useState(START_MS);
  const [answer, setAnswer] = useState<{ tone: ToneId | null; ok: boolean } | null>(null);
  const [correct, setCorrect] = useState(0);
  const deadline = useRef(0);
  const item = round[i];
  const done = started && i >= ROUND;

  // Đồng hồ đếm ngược của câu hiện tại
  useEffect(() => {
    if (!started || done || answer) return;
    void playText(item.word);
    deadline.current = performance.now() + limit;
    setLeft(limit);
    const id = window.setInterval(() => {
      const ms = deadline.current - performance.now();
      if (ms <= 0) {
        window.clearInterval(id);
        submit(null);
      } else setLeft(ms);
    }, 100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, i, done, answer === null]);

  function submit(tone: ToneId | null) {
    if (answer || !item) return;
    const ok = tone === item.tone;
    setAnswer({ tone, ok });
    playSfx(ok ? 'dung' : 'sai');
    if (ok) setCorrect((c) => c + 1);
    gymStore.record(item.tone, ok);
    setLimit((l) => nextTimeLimit(l, ok));
  }

  if (!started || done) {
    return (
      <div className="flex flex-col gap-3">
        <p className="m-0 text-sm text-ink-soft">{t('catchIntro')}</p>
        {done && (
          <p role="status" className="m-0 rounded-xl bg-accent-soft p-3 font-bold text-heading">
            {t('catchDone', { c: correct, n: ROUND, s: (limit / 1000).toFixed(1) })}
          </p>
        )}
        <Button
          onClick={() => {
            if (done) setGame((g) => g + 1);
            setI(0);
            setCorrect(0);
            setAnswer(null);
            setLimit(START_MS);
            setStarted(true);
          }}
        >
          {done ? t('again') : t('catchStart')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 text-lg font-extrabold text-ink">{t('catchQ', { i: i + 1, n: ROUND })}</p>
        <Button variant="secondary" onClick={() => void playText(item.word)}>
          <Icon name="loa" size={18} />
          {t('listen')}
        </Button>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={t('timeLeft')} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.round(answer ? 0 : left)}>
        <div className="h-full bg-accent" style={{ width: `${answer ? 0 : (left / limit) * 100}%` }} />
      </div>
      <div role="group" aria-label={t('tonesGroup')} className="grid grid-cols-2 gap-2 min-[360px]:grid-cols-3">
        {TONES.map((tone) => (
          <button key={tone} type="button" disabled={answer !== null} onClick={() => submit(tone)} className={[btn, answer && tone === item.tone ? 'border-accent bg-accent-soft' : ''].join(' ')}>
            {toneName(tone)}
          </button>
        ))}
      </div>
      {answer && (
        <div role="status" className="flex flex-col gap-2 rounded-xl border border-line bg-sunken p-3">
          <div className="flex items-center gap-2">
            <CuTit mood={answer.ok ? 'khen' : 'dong-vien'} size={56} />
            <strong className={answer.ok ? 'text-heading' : 'text-danger'}>
              {answer.tone === null ? t('timeout', { word: item.word, tone: toneName(item.tone) }) : t(answer.ok ? 'catchRight' : 'catchWrong', { word: item.word, tone: toneName(item.tone) })}
            </strong>
          </div>
          <Button
            onClick={() => {
              setAnswer(null);
              setI((x) => x + 1);
            }}
          >
            {t('nextQ')}
          </Button>
        </div>
      )}
    </div>
  );
}

function ToneProgress() {
  const t = useT();
  const toneName = useToneName();
  const toneStats = useProgress((s) => s.toneStats);
  const byDay = useGymByDay();
  const rows = toneProgress(toneStats, byDay);
  const pct = (x: number | null) => (x === null ? t('none') : `${Math.round(x * 100)}%`);
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-ink-soft">{t('progressLead')}</p>
      <ul aria-label={t('progressTable')} className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((r) => (
          <li key={r.tone} className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-3">
            <strong className="text-ink">{toneName(r.tone)}</strong>
            <div className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 text-sm text-ink-soft">
              <span>{t('speak')}</span>
              <span className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                <span className="block h-full bg-accent" style={{ width: `${r.speakAvg ?? 0}%` }} />
              </span>
              <span>{r.speakAvg === null ? t('none') : `${r.speakAvg}/100`}</span>
              <span>{t('hear')}</span>
              <span className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                <span className="block h-full bg-heading" style={{ width: `${(r.listenRate ?? 0) * 100}%` }} />
              </span>
              <span>{pct(r.listenRate)}</span>
            </div>
            <div className="flex h-6 items-end gap-1" role="img" aria-label={t('trend', { list: r.trend.map((x) => (x === null ? t('dayNone') : `${Math.round(x * 100)}%`)).join(', ') })}>
              {r.trend.map((x, k) => (
                <span key={k} className={x === null ? 'w-full rounded-sm bg-surface-2' : 'w-full rounded-sm bg-accent'} style={{ height: x === null ? '15%' : `${Math.max(15, x * 100)}%` }} />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Phòng tập thanh điệu (GĐ2): nghe phân biệt cặp tối thiểu (ma/má/mà…), “bắt thanh” tốc độ tăng dần,
 * biểu đồ tiến bộ từng thanh. Không cần micro; không có âm thanh vẫn làm được (chữ hiện sau khi chọn).
 */
export function ToneGymScreen() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('pairs');
  const [seed] = useState(initialSeed);
  const dialect = useLearner((s) => s.preferences.dialect);
  useEffect(() => {
    void prefetchPack('tones', dialect);
  }, [dialect]);
  const tabs: Tab[] = ['pairs', 'catch', 'progress'];
  return (
    <div className="min-h-dvh bg-canvas px-4 pb-8 pt-[calc(16px+env(safe-area-inset-top))] font-sans text-ink">
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">
      <h1 className="m-0 text-2xl font-black text-heading">{t('title')}</h1>
      <p className="m-0 text-sm text-ink-soft">{t('lead')}</p>
      <div role="tablist" aria-label={t('tabs')} className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
        {tabs.map((x) => (
          <button
            key={x}
            type="button"
            role="tab"
            aria-selected={tab === x}
            onClick={() => setTab(x)}
            className={['min-h-11 rounded-lg px-1 text-sm font-bold', tab === x ? 'bg-surface text-heading shadow-card' : 'text-ink-soft'].join(' ')}
          >
            {t(`tab.${x}`)}
          </button>
        ))}
      </div>
      <section role="tabpanel" aria-label={t(`tab.${tab}`)} className="rounded-2xl border border-line-strong bg-surface p-4 shadow-card">
        {tab === 'pairs' && <MinimalPairs seed={seed} />}
        {tab === 'catch' && <CatchTone seed={seed} />}
        {tab === 'progress' && <ToneProgress />}
      </section>
      </div>
    </div>
  );
}
