import { useEffect, useRef, useState } from 'react';
import { learnerStore } from '@vietlearning/state';
import { playText, stopPlayback } from '../audio/coursePlayer';
import { Icon } from '@vietlearning/ui';
import { answerFeedback, FeedbackMascot } from '../feedback';
import { useT } from '../i18n';
import type { ExerciseItem, ExerciseResult } from '../types';

type StoryItem = Extract<ExerciseItem, { kind: 'story' }>;

/**
 * Chấm cả truyện bằng phép đếm (không phải thuật toán học mới): đạt khi đúng ≥ 2/3 số câu hỏi ở lần trả lời
 * duy nhất. SM-2 (A4): đúng hết 5, đạt 3, chưa đạt 1.
 */
export function gradeStory(right: number, total: number): { correct: boolean; quality: number } {
  const correct = right >= Math.ceil((total * 2) / 3);
  return { correct, quality: right === total ? 5 : correct ? 3 : 1 };
}

const btn = 'min-h-12 rounded-xl border border-line bg-surface-2 px-4 font-bold text-ink';

/**
 * Truyện ngắn / đoạn hội thoại nghe (GĐ2b): nghe cả truyện hoặc từng câu (tệp dựng sẵn theo miền nếu có, không
 * thì TTS của máy), bản dịch ẩn mặc định, rồi trả lời từng câu hỏi hiểu với phản hồi ngay.
 * “Không nghe được lúc này” bỏ qua cả truyện, không tính đúng/sai.
 */
export default function StoryExercise({ item, onDone, onSkip }: { item: StoryItem; onDone(r: ExerciseResult): void; onSkip?(): void }) {
  const t = useT();
  const en = learnerStore.getState().preferences.uiLanguage === 'en';
  const [showEn, setShowEn] = useState(false);
  const [qi, setQi] = useState(-1); // -1 = đang nghe truyện
  const [chosen, setChosen] = useState<string | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const run = useRef(0);
  const feedbackRef = useRef<HTMLDivElement>(null);

  // rời bài giữa chừng: dừng đọc
  useEffect(
    () => () => {
      run.current++;
      stopPlayback();
    },
    []
  );
  useEffect(() => {
    if (chosen !== null) feedbackRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [chosen]);

  const playAll = async () => {
    const id = ++run.current;
    for (const l of item.lines) {
      if (run.current !== id) return;
      await playText(l.text);
    }
  };
  const playOne = (text: string) => {
    run.current++;
    void playText(text);
  };

  const lines = (
    <ol className="m-0 flex list-none flex-col gap-2 p-0">
      {item.lines.map((l, i) => (
        <li key={i} className="flex items-start gap-2 rounded-xl bg-sunken p-2">
          <button type="button" aria-label={t('storyLine', { i: i + 1 })} onClick={() => playOne(l.text)} className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg border border-line bg-surface text-lg">
            <Icon name="loa" size={20} />
          </button>
          <span className="flex flex-col">
            <span className="text-xs font-bold text-ink-muted">{l.speaker}</span>
            <span lang="vi" className="text-base font-bold text-ink">
              {l.text}
            </span>
            {showEn && <span className="text-sm text-ink-soft">{l.en}</span>}
          </span>
        </li>
      ))}
    </ol>
  );

  if (qi < 0) {
    return (
      <div className="flex flex-col gap-3">
        <h3 className="m-0 text-base font-extrabold text-heading">
          <span lang="vi">{item.title}</span>
          {en && <span className="block text-sm font-bold text-ink-soft">{item.titleEn}</span>}
        </h3>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void playAll()} className={btn}>
            {t('storyPlayAll')}
          </button>
          <button type="button" aria-pressed={showEn} onClick={() => setShowEn((v) => !v)} className={btn}>
            {showEn ? t('storyHideEn') : t('storyShowEn')}
          </button>
          {onSkip && (
            <button type="button" onClick={onSkip} className="min-h-12 rounded-xl border border-line bg-surface px-4 text-sm font-bold text-ink-soft">
              {t('cantListen')}
            </button>
          )}
        </div>
        {lines}
        <button type="button" onClick={() => setQi(0)} className="min-h-12 w-full rounded-xl bg-accent font-extrabold text-accent-ink">
          {t('storyStart')}
        </button>
      </div>
    );
  }

  const q = item.questions[qi];
  const correct = chosen === q.answer;
  const last = qi === item.questions.length - 1;
  const right = results.filter(Boolean).length;

  const next = () => {
    if (!last) {
      setQi(qi + 1);
      setChosen(null);
      return;
    }
    const g = gradeStory(right, item.questions.length);
    const missed = item.questions.find((_, i) => !results[i]);
    onDone({
      key: item.key,
      correct: g.correct,
      skipped: false,
      quality: g.quality,
      answer: missed ? missed.answer : item.title,
      front: missed ? `${item.title} — ${missed.question}` : undefined
    });
  };

  const choose = (o: string) => {
    setChosen(o);
    answerFeedback(o === q.answer);
    setResults((r) => [...r, o === q.answer]);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-xs font-bold uppercase tracking-wide text-ink-muted">{t('storyQ', { i: qi + 1, n: item.questions.length })}</p>
      <p lang="vi" className="m-0 rounded-xl bg-sunken p-3 text-xl font-extrabold text-ink">
        {q.question}
      </p>
      {en && <p className="m-0 text-sm text-ink-soft">{q.questionEn}</p>}
      <details className="rounded-xl border border-line p-2">
        <summary className="min-h-11 cursor-pointer content-center font-bold text-ink">{t('storyReread')}</summary>
        {lines}
      </details>
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2" role="group" aria-label={t('choices')}>
        {q.options.map((o) => {
          const state = chosen === null ? 'idle' : o === q.answer ? 'right' : o === chosen ? 'wrong' : 'idle';
          return (
            <button
              key={o}
              type="button"
              lang="vi"
              disabled={chosen !== null}
              onClick={() => choose(o)}
              className={[
                'min-h-14 break-words rounded-xl border-2 px-2 py-1 text-base font-bold',
                state === 'right' ? 'border-accent bg-accent text-accent-ink' : state === 'wrong' ? 'border-danger bg-danger-soft text-danger-ink' : 'border-line bg-surface-2 text-ink'
              ].join(' ')}
            >
              {o}
            </button>
          );
        })}
      </div>
      {chosen !== null && (
        <div ref={feedbackRef} role="status" className={['scroll-mb-[calc(80px+env(safe-area-inset-bottom))] rounded-xl p-3 text-[15px]', correct ? 'bg-accent-soft text-heading' : 'bg-danger-soft text-danger-ink'].join(' ')}>
          <div className="flex items-center gap-3">
            <FeedbackMascot correct={correct} />
            <strong>{correct ? t('right') : t('wrong', { answer: q.answer })}</strong>
          </div>
          {last && <span className="block">{t('storyScore', { r: right, n: item.questions.length })}</span>}
          <button type="button" onClick={next} className="mt-2 block min-h-12 w-full rounded-xl bg-accent font-extrabold text-accent-ink">
            {t('next')}
          </button>
        </div>
      )}
    </div>
  );
}
