import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ROLEPLAY_SCENARIOS, type RoleplayScenario } from '@vietlearning/content';
import type { ChatCorrection } from '@vietlearning/contracts/api';
import { learnerStore, useLearner } from '@vietlearning/state';
import { ChatPanel } from '../chat/ChatPanel';
import { useChatSession } from '../chat/useChatSession';
import { t as tConv, useT } from '../i18n';

const btn = 'min-h-12 w-full rounded-xl px-4 font-extrabold';

/** Tên/nhiệm vụ của kịch bản theo ngôn ngữ giao diện (Gateway vẫn chấm theo chỉ số nhiệm vụ) */
function useScenarioText() {
  const en = useLearner((s) => s.preferences.uiLanguage) === 'en';
  return {
    en,
    title: (s: RoleplayScenario) => (en ? s.titleEn : s.title),
    place: (s: RoleplayScenario) => (en ? s.locationEn : s.location),
    tasks: (s: RoleplayScenario) => (en ? s.tasksEn : s.tasks)
  };
}

function Frame({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas px-4 pb-8 pt-[calc(16px+env(safe-area-inset-top))] font-sans text-ink">
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">
        <header className="flex items-center justify-between gap-2 border-b-2 border-line pb-4">
          <h1 className="m-0 text-[26px] font-black leading-tight tracking-tight text-heading">{title}</h1>
          {action}
        </header>
        {children}
      </div>
    </div>
  );
}

function Session({ scenario, onExit }: { scenario: RoleplayScenario; onExit: () => void }) {
  const t = useT();
  const text = useScenarioText();
  const learnerDialect = useLearner((s) => s.preferences.dialect);
  const [done, setDone] = useState<number[]>([]);
  const [corrections, setCorrections] = useState<ChatCorrection[]>([]);
  const [ended, setEnded] = useState(false);
  const session = useChatSession({
    scenarioId: scenario.id,
    // "all" = theo phương ngữ người học chọn
    dialect: scenario.targetDialect === 'all' ? learnerDialect : scenario.targetDialect,
    onTurnDone: ({ completedTasks, correction }) => {
      // Nhiệm vụ do Gateway chấm (contract: completedTasks), client chỉ hiển thị
      setDone((d) => Array.from(new Set([...d, ...completedTasks])).sort());
      if (correction) setCorrections((c) => [...c, correction]);
    }
  });
  const tasks = text.tasks(scenario);
  const allDone = done.length === tasks.length;

  const finish = () => {
    session.cancel();
    const store = learnerStore.getState();
    for (const c of corrections) {
      store.addCard({ itemRef: `roleplay:${c.corrected.toLowerCase()}`, front: c.corrected, back: `${tConv('youWrote', { text: c.original })} ${c.explanation}`, source: 'conversation' });
    }
    setEnded(true);
  };

  if (ended) {
    return (
      <section role="status" className="flex flex-col gap-3 rounded-2xl border border-line-strong bg-surface p-4 shadow-card">
        <h2 className="m-0 text-xl font-black text-ink">{t('summary', { done: done.length, total: tasks.length })}</h2>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {tasks.map((task, i) => (
            <li key={task} className="text-[15px]">
              {done.includes(i) ? '✅' : '⬜'} {task}
            </li>
          ))}
        </ul>
        <h3 className="m-0 text-lg font-extrabold text-ink">{t('mistakes', { n: corrections.length })}</h3>
        {corrections.length === 0 ? (
          <p className="m-0 text-[15px] text-ink-soft">{t('noMistakes')}</p>
        ) : (
          <>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {corrections.map((c, i) => (
                <li key={i} className="rounded-xl bg-surface-2 p-2 text-[15px]">
                  <s lang="vi" className="text-ink-muted">
                    {c.original}
                  </s>{' '}
                  → <strong lang="vi">{c.corrected}</strong>
                </li>
              ))}
            </ul>
            <p className="m-0 text-sm text-ink-muted">{t('savedCards')}</p>
          </>
        )}
        <button type="button" className={`${btn} bg-accent text-accent-ink`} onClick={onExit}>
          {t('otherScenario')}
        </button>
      </section>
    );
  }

  return (
    <>
      <section aria-labelledby="ct-tasks" className="flex flex-col gap-2 rounded-2xl border border-line-strong bg-surface p-4 shadow-card">
        <h2 id="ct-tasks" className="m-0 text-lg font-extrabold text-ink">
          {text.title(scenario)} · {text.place(scenario)}
        </h2>
        <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={t('tasks')}>
          {tasks.map((task, i) => (
            <li key={task} className="text-[15px]">
              <span aria-hidden="true">{done.includes(i) ? '✅' : '⬜'} </span>
              <span className={done.includes(i) ? 'text-ink-muted line-through' : 'text-ink'}>{task}</span>
              <span className="sr-only">{done.includes(i) ? t('taskDone') : t('taskTodo')}</span>
            </li>
          ))}
        </ul>
      </section>
      <ChatPanel session={session} tutorName={t('npc')} placeholder={t('npcPlaceholder')} emptyHint={t('rpEmpty', { place: text.place(scenario), task: tasks[0] })} />
      <button type="button" className={`${btn} ${allDone ? 'bg-accent text-accent-ink' : 'border border-line-strong bg-surface-2 text-ink'}`} onClick={finish}>
        {allDone ? t('finishAll') : t('finish')}
      </button>
    </>
  );
}

/** Màn hình M7: chọn 1 trong 4 tình huống, nhập vai với nhân vật, theo dõi nhiệm vụ, tổng kết lỗi. */
export function RoleplayScreen() {
  const t = useT();
  const text = useScenarioText();
  const [scenario, setScenario] = useState<RoleplayScenario | null>(null);
  return (
    <Frame
      title={t('roleplayTitle')}
      action={
        <Link to="/hoi-thoai" className="flex min-h-11 items-center rounded-xl border border-line-strong bg-surface px-3 text-sm font-bold text-ink no-underline">
          {t('chatLink')}
        </Link>
      }
    >
      {scenario ? (
        <Session key={scenario.id} scenario={scenario} onExit={() => setScenario(null)} />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {ROLEPLAY_SCENARIOS.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => setScenario(s)} className="flex min-h-20 w-full flex-col items-start gap-1 rounded-2xl border border-line-strong bg-surface p-4 text-left shadow-card">
                <span className="text-lg font-extrabold text-ink">{text.title(s)}</span>
                <span className="text-sm text-ink-muted">
                  {text.place(s)} · {t(`dialect.${s.targetDialect}`)} · {t('taskCount', { n: s.tasks.length })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}
