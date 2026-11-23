import { useMemo, useRef, useState } from 'react';
import type { ExerciseRef } from '@vietlearning/content';
import { buildItem, ExerciseView, type ExerciseItem, type ExerciseResult } from '@vietlearning/exercises';
import { learnerStore, type Skill } from '@vietlearning/state';
import { progressStore } from '@vietlearning/state/progress';
import { Button, Icon } from '@vietlearning/ui';
import { useT } from '../i18n';
import { answer, current, startSession, summarize, type SessionState } from './lessonSession';

export interface SessionOutcome extends ReturnType<typeof summarize> {
  /** thanh điệu làm chưa đạt trong phiên */
  weakTones: string[];
}

const SKILL: Record<ExerciseRef['type'], Skill> = {
  meaning: 'drill',
  listen: 'drill',
  fill: 'drill',
  build: 'sentence',
  tone: 'pronunciation',
  pronoun: 'honorific',
  dialect: 'dialect',
  speak: 'pronunciation',
  situation: 'honorific',
  story: 'drill'
};

/** seed xác định theo chuỗi (id bài) để dựng lại được cùng một bài */
export function seedOf(text: string): number {
  let h = 7;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 2147483647;
  return h;
}

/**
 * Chạy một phiên bài tập: thanh tiến độ, phản hồi ngay (trong từng dạng bài), câu sai quay lại cuối phiên.
 * Mỗi câu trả lời được ghi ngay: lịch sử làm bài (M9), thẻ ôn SM-2 cho câu sai (A4), “lỗi gần đây”, điểm thanh điệu.
 */
export function SessionRunner({
  refs,
  seedKey,
  maxRetries,
  onFinish,
  title,
  onClose
}: {
  refs: readonly ExerciseRef[];
  seedKey: string;
  maxRetries?: number;
  onFinish(o: SessionOutcome): void;
  title: string;
  onClose(): void;
}) {
  const t = useT();
  const [state, setState] = useState<SessionState>(() => startSession(refs, maxRetries));
  const weakTones = useRef(new Set<string>());
  const finished = useRef(false);
  const entry = current(state);
  const seed = seedOf(seedKey) + (entry?.slot ?? 0);
  const item: ExerciseItem | null = useMemo(() => (entry ? buildItem(entry.ref, seed) : null), [entry, seed]);
  const firstCount = refs.length;
  const answered = Math.min(state.pos, state.queue.length);

  const advance = (r: Pick<ExerciseResult, 'key' | 'correct' | 'skipped'>) => {
    const next = answer(state, r);
    setState(next);
    if (next.done && !finished.current) {
      finished.current = true;
      onFinish({ ...summarize(next), weakTones: [...weakTones.current] });
    }
  };

  const onDone = (r: ExerciseResult) => {
    if (!entry || !item) return;
    const learner = learnerStore.getState();
    const progress = progressStore.getState();
    const itemRef = `path:${r.key}`;
    learner.recordAttempt(SKILL[entry.ref.type], r.correct, r.score);
    if (r.tone && typeof r.score === 'number') progress.recordTone(r.tone, r.score);
    if (!r.correct) {
      if (r.tone) weakTones.current.add(r.tone);
      progress.recordMistake(r.key);
      // mặt trước thẻ: câu có chỗ trống (nếu có) thay vì đề chung chung “Điền vào chỗ trống”
      // truyện: câu hỏi bị sai (r.front) thay vì đề chung “Nghe truyện rồi trả lời”
      const front = r.front ?? (item.kind === 'choice' && item.display ? item.display : item.prompt);
      learner.addCard({ itemRef, front, back: r.answer, source: SKILL[entry.ref.type] });
    } else if (entry.attempt === 1) {
      // đúng ngay lần đầu (ở bài sau hoặc khu Ôn tập) => không còn là “lỗi gần đây”;
      // sửa đúng khi câu quay lại trong CÙNG phiên thì vẫn giữ để ôn lại sau
      progress.clearMistake(r.key);
    }
    if (learnerStore.getState().srs[itemRef]) learner.reviewCard(itemRef, r.quality);
    advance(r);
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-3">
        <Button variant="secondary" onClick={onClose} aria-label={t('close')} style={{ minWidth: 44, minHeight: 44, padding: 0 }}>
          <Icon name="quay-lai" size={22} />
        </Button>
        <div
          className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-label={t('progress')}
          aria-valuemin={0}
          aria-valuemax={state.queue.length}
          aria-valuenow={answered}
        >
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(answered / Math.max(1, state.queue.length)) * 100}%` }} />
        </div>
      </header>
      {item && entry && (
        <ExerciseView
          key={`${state.pos}`}
          item={item}
          seed={seed}
          label={`${title} · ${t('itemOf', { i: Math.min(state.pos + 1, firstCount), n: firstCount })}${entry.attempt > 1 ? ` · ${t('retry')}` : ''}`}
          onDone={onDone}
          onSkip={() => advance({ key: entry.key, correct: false, skipped: true })}
        />
      )}
    </div>
  );
}
