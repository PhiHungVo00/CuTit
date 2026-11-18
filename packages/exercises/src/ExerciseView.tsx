import { lazy, Suspense } from 'react';
import { useT } from './i18n';
import { ChoiceExercise } from './choice/ChoiceExercise';
import { SentenceExercise } from './sentence/SentenceExercise';
import type { ExerciseItem, ExerciseResult } from './types';

// Luyện thanh kéo theo bộ thu âm + biểu đồ: chỉ tải khi gặp bài luyện thanh
const ToneExercise = lazy(() => import('./tone/ToneExercise'));
// Nói lại câu (A3): bộ ghi âm + gửi Gateway, chỉ tải khi gặp
const SpeakExercise = lazy(() => import('./speak/SpeakExercise'));
// Truyện ngắn nghe (GĐ2b): chỉ tải khi gặp
const StoryExercise = lazy(() => import('./story/StoryExercise'));

/** Khung chung một bài: nhãn dạng bài + đề, rồi component của dạng đó. */
export function ExerciseView({ item, seed = 1, onDone, onSkip, label }: { item: ExerciseItem; seed?: number; onDone(r: ExerciseResult): void; onSkip?(): void; label?: string }) {
  const t = useT();
  const kind = item.kind === 'choice' ? item.variant : item.kind;
  return (
    <section aria-labelledby="ct-ex-q" className="flex flex-col gap-3 rounded-2xl border border-line-strong bg-surface p-4 shadow-card">
      <p className="m-0 text-xs font-bold uppercase tracking-wide text-ink-muted">
        {t(`kind.${kind}`)}
        {label ? ` · ${label}` : ''}
      </p>
      <h2 id="ct-ex-q" className="m-0 text-lg font-extrabold leading-snug text-ink">
        {item.prompt}
      </h2>
      {item.kind === 'choice' && <ChoiceExercise item={item} onDone={onDone} onSkip={onSkip} />}
      {item.kind === 'build' && <SentenceExercise item={item} seed={seed} onDone={onDone} />}
      {item.kind === 'speak' && (
        <Suspense fallback={<div aria-busy="true" className="h-40 animate-pulse rounded-xl bg-surface-2" />}>
          <SpeakExercise item={item} onDone={onDone} onSkip={onSkip} />
        </Suspense>
      )}
      {item.kind === 'story' && (
        <Suspense fallback={<div aria-busy="true" className="h-40 animate-pulse rounded-xl bg-surface-2" />}>
          <StoryExercise item={item} onDone={onDone} onSkip={onSkip} />
        </Suspense>
      )}
      {item.kind === 'tone' && (
        <Suspense fallback={<div aria-busy="true" className="h-40 animate-pulse rounded-xl bg-surface-2" />}>
          <ToneExercise item={item} onDone={onDone} onSkip={onSkip} />
        </Suspense>
      )}
    </section>
  );
}
