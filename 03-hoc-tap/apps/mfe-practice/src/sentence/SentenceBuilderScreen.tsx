import { useEffect, useMemo, useRef, useState } from 'react';
import { SENTENCE_ITEMS, type SentenceBank } from '@vietlearning/content';
import { dueCards, learnerStore, useLearner } from '@vietlearning/state';
import { SlowListen, say } from '../listen';
import { answerFeedback, FeedbackMascot, useSentenceBuilder } from '@vietlearning/exercises';
import { Button, Card, Icon } from '@vietlearning/ui';
import { useT } from '../i18n';

/** Chủ đề câu (dữ liệu tiếng Việt) => nhãn tiếng Anh */
const TOPIC_EN: Record<string, string> = {
  'Ăn uống': 'Food & drink',
  'Học tập': 'Study',
  'Thời tiết': 'Weather',
  'Gia đình': 'Family',
  'Chào hỏi': 'Greetings',
  'Du lịch': 'Travel',
  'Mua sắm': 'Shopping',
  'Đường phố': 'Getting around',
  'Thời gian': 'Time',
  'Thể thao': 'Sport',
  'Công việc': 'Work'
};

/** Hàng đợi: câu đến hạn ôn (SM-2) trước, rồi câu mới hợp trình độ (≤ level + 1) */
function buildQueue(level: number): SentenceBank[] {
  const due = dueCards(learnerStore.getState().srs)
    .filter((c) => c.itemRef.startsWith('sentence:'))
    .map((c) => SENTENCE_ITEMS.find((s) => `sentence:${s.id}` === c.itemRef))
    .filter((s): s is SentenceBank => Boolean(s));
  const fresh = SENTENCE_ITEMS.filter((s) => s.level <= Math.max(1, level + 1) && !due.includes(s));
  return [...due, ...fresh];
}

function Exercise({ item, seed, onNext }: { item: SentenceBank; seed: number; onNext: () => void }) {
  const t = useT();
  const en = useLearner((s) => s.preferences.uiLanguage) === 'en';
  const b = useSentenceBuilder(item, seed);
  const recordAttempt = useLearner((s) => s.recordAttempt);
  const addCard = useLearner((s) => s.addCard);
  const reviewCard = useLearner((s) => s.reviewCard);
  const feedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (b.result) feedbackRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [b.result]);

  const onCheck = () => {
    const r = b.check();
    answerFeedback(r.valid);
    const ref = `sentence:${item.id}`;
    recordAttempt('sentence', r.valid);
    if (!r.valid) addCard({ itemRef: ref, front: item.translation, back: r.correctOrder.join(' '), source: 'sentence' });
    if (learnerStore.getState().srs[ref]) reviewCard(ref, r.valid ? 4 : 1);
  };

  const sentence = b.placed.map((i) => item.tokens[i].text).join(' ');

  return (
    <Card role="region" aria-labelledby="ct-sb-prompt" elevated style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="m-0 text-xs font-bold uppercase tracking-wide text-ink-muted">
            {t('levelTag', { topic: en ? (TOPIC_EN[item.topic] ?? item.topic) : item.topic, level: item.level })}
          </p>
          <h2 id="ct-sb-prompt" className="m-0 text-lg font-extrabold text-ink">
            {item.translation}
          </h2>
        </div>
        {!item.reviewed && <span className="shrink-0 text-xs italic text-ink-muted">{t('unreviewed')}</span>}
      </div>

      {/* Hàng câu đang ghép: chạm một từ để gỡ ra */}
      <div
        aria-label={t('yourSentence')}
        role="group"
        className="flex min-h-16 flex-wrap content-start gap-2 rounded-xl border-2 border-dashed border-line bg-sunken p-2"
      >
        {b.placed.length === 0 && <span className="self-center px-2 text-sm text-ink-muted">{t('tapWords')}</span>}
        {b.placed.map((tokIdx, pos) => {
          const wrong = b.result && !b.result.valid && b.result.misplaced.includes(pos);
          return (
            <button
              key={tokIdx}
              type="button"
              onClick={() => b.remove(pos)}
              aria-label={t('remove', { word: item.tokens[tokIdx].text })}
              className={[
                'min-h-11 rounded-xl border-2 px-3 text-base font-bold',
                b.result?.valid ? 'border-accent bg-accent text-accent-ink' : wrong ? 'border-danger bg-danger-soft text-danger-ink' : 'border-line-strong bg-surface text-ink'
              ].join(' ')}
            >
              {item.tokens[tokIdx].text}
            </button>
          );
        })}
      </div>

      {/* Kho từ còn lại */}
      <div role="group" aria-label={t('wordBank')} className="flex flex-wrap gap-2">
        {b.pool.map((tokIdx) => {
          const used = b.placed.includes(tokIdx);
          return (
            <button
              key={tokIdx}
              type="button"
              disabled={used}
              onClick={() => b.place(tokIdx)}
              className="min-h-11 rounded-xl border border-line bg-surface-2 px-3 text-base font-semibold text-ink disabled:opacity-25"
            >
              {item.tokens[tokIdx].text}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" size="sm" onClick={b.undo} disabled={!b.canUndo || b.result?.valid}>
          {t('undo')}
        </Button>
        {b.result?.valid ? (
          <Button style={{ gridColumn: 'span 2' }} onClick={onNext}>
            {t('nextSentence')}
          </Button>
        ) : (
          <Button style={{ gridColumn: 'span 2' }} onClick={onCheck} disabled={!b.complete}>
            {t('check')}
          </Button>
        )}
      </div>

      <div ref={feedbackRef} className="scroll-mb-[calc(80px+env(safe-area-inset-bottom))]">
        {b.result?.valid && (
          <div role="status" className="flex items-center justify-between gap-2 rounded-xl bg-accent-soft p-3">
            <FeedbackMascot correct size={48} />
            <span className="text-[15px] font-bold text-heading">{t('correct', { sentence })}</span>
            <button
              type="button"
              aria-label={t('listenSentence')}
              onClick={() => void say(sentence, 0.9)}
              className="grid min-h-11 min-w-11 place-items-center rounded-xl bg-surface text-ink"
            >
              <Icon name="loa" size={20} />
            </button>
            <SlowListen text={sentence} base={0.9} className="min-h-11 min-w-11 rounded-xl bg-surface text-lg" />
          </div>
        )}
        {b.result && !b.result.valid && (
          <div role="alert" className="flex flex-col gap-2 rounded-xl bg-danger-soft p-3 text-[15px] text-danger-ink">
            <FeedbackMascot correct={false} size={48} />
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
              {b.result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            {b.result.hint && <p className="m-0 text-sm">{b.result.hint}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={onNext}>
                {t('skip')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Màn hình M8: ghép câu "đốt tre" — chạm để đặt từ, A8 chấm và giải thích lỗi trật tự. */
export function SentenceBuilderScreen() {
  const t = useT();
  const level = useLearner((s) => s.profile.level);
  const queue = useMemo(() => buildQueue(level), [level]);
  const [index, setIndex] = useState(0);
  const item = queue[index % queue.length];

  return (
    <div className="min-h-dvh bg-canvas px-4 pb-8 pt-[calc(16px+env(safe-area-inset-top))] font-sans text-ink">
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">
        <header className="flex flex-col gap-2 border-b-2 border-line pb-4">
          <h1 className="m-0 text-[26px] font-black leading-tight tracking-tight text-heading">{t('sentenceTitle')}</h1>
          <p className="m-0 text-[15px] text-ink-soft">
            {t('sentenceIntro', { i: (index % queue.length) + 1, n: queue.length })}
          </p>
        </header>
        {/* key: đổi câu thì dựng lại bài, xóa trạng thái câu trước */}
        <Exercise key={`${item.id}-${index}`} item={item} seed={index + 7} onNext={() => setIndex((i) => i + 1)} />
      </div>
    </div>
  );
}
