import { useState } from 'react';
import type { Dialogue } from '@vietlearning/content';
import { useUiLanguage } from '@vietlearning/state';
import { playSfx } from '@vietlearning/shared/audio';
import { CuTit } from '@vietlearning/ui';
import { useT } from '../i18n';
import { findNode, runStep, scoreRun, type StepResult } from './engine';

export interface DialogueOutcome {
  passed: boolean;
  /** tỉ lệ nút chấm xưng hô được chọn đúng ngay lần đầu, 0–1 */
  honorificScore: number;
}

/**
 * Chạy tình huống rẽ nhánh (dự án 2, Task 3): Cu Tít nói, người học chọn câu, rẽ nhánh theo lựa chọn, chấm xưng hô (A6).
 * Không cần AI/mạng. `onDone` chỉ gọi khi tới `end-ok`; `end-retry` cho làm lại (không ghi tiến độ).
 * Nút “Luyện với Cu Tít” gọi `onPractice(aiScenarioId)`: MFE cha điều hướng (gói này không biết router, Nguyên tắc 7).
 */
export function DialogueRunner({ dialogue, onDone, onPractice }: { dialogue: Dialogue; onDone(o: DialogueOutcome): void; onPractice?(aiScenarioId: string): void }) {
  const t = useT();
  const en = useUiLanguage() === 'en';
  const [nodeId, setNodeId] = useState(dialogue.start);
  const [pending, setPending] = useState<StepResult | null>(null);
  const [steps, setSteps] = useState<StepResult[]>([]);
  const [end, setEnd] = useState<'end-ok' | 'end-retry' | null>(null);

  const node = findNode(dialogue, nodeId);
  const score = scoreRun(steps);

  const choose = (i: number) => {
    const r = runStep(dialogue, nodeId, i);
    const all = [...steps, r];
    setSteps(all);
    if (r.graded) setPending(r);
    else advance(r, all);
  };
  const advance = (r: StepResult, all: StepResult[]) => {
    setPending(null);
    if (r.next === 'end-ok') {
      setEnd('end-ok');
      playSfx('hoan-thanh');
      onDone({ passed: true, honorificScore: scoreRun(all).honorificScore });
    } else if (r.next === 'end-retry') setEnd('end-retry');
    else setNodeId(r.next);
  };
  const restart = () => {
    setNodeId(dialogue.start);
    setSteps([]);
    setPending(null);
    setEnd(null);
  };

  const practice = onPractice && (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={() => onPractice(dialogue.aiScenarioId)} className="min-h-12 rounded-xl border border-line-strong bg-surface px-4 font-bold text-ink">
        {t('dlgPractice')}
      </button>
      <p className="m-0 text-center text-xs text-ink-soft">{t('dlgPracticeHint')}</p>
    </div>
  );

  if (end === 'end-ok')
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <CuTit mood="an-mung" size={96} />
        <h2 className="m-0 text-xl font-black text-heading">{t('dlgDoneTitle')}</h2>
        {score.total > 0 && <p className="m-0 text-ink">{t('dlgDoneScore', { ok: score.ok, total: score.total })}</p>}
        {practice}
      </div>
    );
  if (end === 'end-retry')
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <CuTit mood="suy-nghi" size={96} />
        <h2 className="m-0 text-xl font-black text-heading">{t('dlgRetryTitle')}</h2>
        <p className="m-0 text-ink">{t('dlgRetryBody')}</p>
        <button type="button" onClick={restart} className="min-h-12 rounded-xl bg-accent px-6 font-bold text-accent-ink">
          {t('dlgRetry')}
        </button>
        {practice}
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      <h2 className="m-0 text-base font-extrabold text-heading">{en ? dialogue.titleEn : dialogue.title}</h2>
      <div className="flex items-start gap-2">
        <CuTit mood="chan-dung" size={56} />
        <div className="flex-1 rounded-2xl bg-surface-2 p-3 text-ink">
          <p lang="vi" className="m-0">{node.cutit}</p>
          {en && <p lang="en" className="m-0 mt-1 text-sm text-ink-soft">{node.cutitEn}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-2" role="group" aria-label={t('dlgChoose')}>
        {node.options.map((o, i) => (
          <button
            key={`${nodeId}-${i}`}
            type="button"
            disabled={pending !== null}
            onClick={() => choose(i)}
            className="min-h-12 rounded-xl border-2 border-line bg-surface px-4 py-2 text-left font-bold text-ink disabled:opacity-60"
          >
            {/* câu người học nói là nội dung học: luôn tiếng Việt; giao diện tiếng Anh thêm bản dịch bên dưới */}
            <span lang="vi" className="block">{o.text}</span>
            {en && <span lang="en" className="block text-sm font-normal text-ink-soft">{o.textEn}</span>}
          </button>
        ))}
      </div>
      {pending && (
        <div role="status" className="flex flex-col gap-2 rounded-xl bg-accent-soft p-3 text-heading">
          <p className="m-0 font-bold">
            {pending.honorificOk ? t('dlgHonorOk') : t('dlgHonorFix', { speaker: node.a6!.speaker, listener: node.a6!.listener })}
          </p>
          <button type="button" onClick={() => advance(pending, steps)} className="min-h-12 rounded-xl bg-accent px-6 font-bold text-accent-ink">
            {t('dlgNext')}
          </button>
        </div>
      )}
    </div>
  );
}
