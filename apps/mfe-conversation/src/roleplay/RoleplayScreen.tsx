import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ROLEPLAY_SCENARIOS, findLesson, type RoleplayScenario } from '@vietlearning/content';
import type { ChatCorrection, NewWord } from '@vietlearning/contracts/api';
import { useLearner } from '@vietlearning/state';
import { Button, Icon } from '@vietlearning/ui';
import { ChatPanel } from '../chat/ChatPanel';
import { useChatSession } from '../chat/useChatSession';
import { t as tConv, useT } from '../i18n';
import { buildSummary } from '../summary/summaryItems';
import { SessionSummary } from '../summary/SessionSummary';

const btn = 'min-h-12 w-full rounded-xl px-4 font-extrabold';

/** Dấu nhiệm vụ: sao khi xong, vòng rỗng khi chưa (không dùng emoji) */
const TaskMark = ({ done }: { done: boolean }) =>
  done ? <Icon name="luyen-tap" size={16} className="inline align-text-bottom text-heading" /> : <span aria-hidden="true" className="inline-block size-3 rounded-full border-2 border-line-strong align-baseline" />;

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

/**
 * Một buổi nhập vai. `lessonId` (từ URL `?bai=`) = bài nhập vai cuối unit của lộ trình: kết thúc khi đã nói ≥ 1 lượt
 * thì ghi tiến độ bài như bài thường (store tiến độ dùng chung qua subpath state, không import mfe-path).
 */
function Session({ scenario, lessonId, onExit }: { scenario: RoleplayScenario; lessonId?: string; onExit: () => void }) {
  const t = useT();
  const text = useScenarioText();
  const learnerDialect = useLearner((s) => s.preferences.dialect);
  const [done, setDone] = useState<number[]>([]);
  const [corrections, setCorrections] = useState<ChatCorrection[]>([]);
  const [words, setWords] = useState<NewWord[]>([]);
  const [turns, setTurns] = useState(0);
  const [ended, setEnded] = useState(false);
  const [xp, setXp] = useState<number | null>(null);
  const session = useChatSession({
    scenarioId: scenario.id,
    // "all" = theo phương ngữ người học chọn
    dialect: scenario.targetDialect === 'all' ? learnerDialect : scenario.targetDialect,
    onTurnDone: ({ completedTasks, correction, newWords }) => {
      // Nhiệm vụ do Gateway chấm (contract: completedTasks), client chỉ hiển thị
      setDone((d) => Array.from(new Set([...d, ...completedTasks])).sort());
      if (correction) setCorrections((c) => [...c, correction]);
      setWords((w) => [...w, ...newWords]);
      setTurns((n) => n + 1);
    }
  });
  const tasks = text.tasks(scenario);
  const allDone = done.length === tasks.length;

  const finish = async () => {
    session.cancel();
    if (lessonId && turns > 0) {
      // Store tiến độ ở subpath riêng (chunk lười): chỉ tải khi thật sự ghi bài
      const { progressStore } = await import('@vietlearning/state/progress');
      setXp(progressStore.getState().completeLesson(lessonId, { total: tasks.length, firstTryCorrect: done.length }).xp);
    }
    setEnded(true);
  };

  if (ended) {
    const lesson = lessonId ? findLesson(lessonId)?.lesson : undefined;
    return (
      <section role="status" aria-labelledby="ct-rp-sum" className="flex flex-col gap-3 rounded-2xl border border-line-strong bg-surface p-4 shadow-card">
        <h2 id="ct-rp-sum" className="m-0 text-xl font-black text-ink">
          {t('summary', { done: done.length, total: tasks.length })}
        </h2>
        {lesson && xp !== null && <p className="m-0 text-[15px] font-bold text-heading">{t('lessonDoneXp', { lesson: text.en ? lesson.titleEn : lesson.title, xp })}</p>}
        {lessonId && xp === null && <p className="m-0 text-sm text-ink-soft">{t('lessonNotCounted')}</p>}
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {tasks.map((task, i) => (
            <li key={task} className="text-[15px]">
              <TaskMark done={done.includes(i)} /> {task}
            </li>
          ))}
        </ul>
        <SessionSummary items={buildSummary(corrections, words, (s) => tConv('youWrote', { text: s }))} />
        {lessonId ? (
          <Link to="/" className={`${btn} flex items-center justify-center bg-accent text-accent-ink no-underline`}>
            {t('backToPath')}
          </Link>
        ) : (
          <Button style={{ width: '100%' }} onClick={onExit}>
            {t('otherScenario')}
          </Button>
        )}
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
              <span aria-hidden="true">
                <TaskMark done={done.includes(i)} />{' '}
              </span>
              <span className={done.includes(i) ? 'text-ink-muted line-through' : 'text-ink'}>{task}</span>
              <span className="sr-only">{done.includes(i) ? t('taskDone') : t('taskTodo')}</span>
            </li>
          ))}
        </ul>
        {scenario.reviewed === false && <p className="m-0 text-xs italic text-ink-muted">{t('draftScenario')}</p>}
      </section>
      <ChatPanel session={session} avatar={false} tutorName={t('npc')} placeholder={t('npcPlaceholder')} emptyHint={t('rpEmpty', { place: text.place(scenario), task: tasks[0] })} />
      <Button variant={allDone ? 'primary' : 'secondary'} style={{ width: '100%' }} onClick={() => void finish()}>
        {allDone ? t('finishAll') : t('finish')}
      </Button>
    </>
  );
}

/**
 * Màn hình M7: chọn kịch bản, nhập vai với nhân vật, theo dõi nhiệm vụ, tổng kết lỗi + từ mới.
 * `?kb=<kịch bản>&bai=<bài lộ trình>`: mở thẳng bài nhập vai cuối unit (lộ trình chỉ liên kết qua URL).
 */
export function RoleplayScreen() {
  const t = useT();
  const text = useScenarioText();
  const [params] = useSearchParams();
  const bai = params.get('bai');
  const [scenario, setScenario] = useState<RoleplayScenario | null>(() => ROLEPLAY_SCENARIOS.find((s) => s.id === params.get('kb')) ?? null);
  // Chỉ ghi tiến độ khi bài trong URL đúng là bài nhập vai của kịch bản này (URL sửa tay không ghi nhầm bài khác)
  const lessonId = bai && scenario && findLesson(bai)?.lesson.roleplay === scenario.id ? bai : undefined;
  return (
    <Frame
      title={t('roleplayTitle')}
      action={
        <Link to="/hoi-thoai" className="flex min-h-11 items-center gap-1 rounded-xl border border-line-strong bg-surface px-3 text-sm font-bold text-ink no-underline">
          <Icon name="chat" size={18} />
          {t('chatLink')}
        </Link>
      }
    >
      {scenario ? (
        <Session key={scenario.id} scenario={scenario} lessonId={lessonId} onExit={() => setScenario(null)} />
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
