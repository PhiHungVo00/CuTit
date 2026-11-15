import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ROLEPLAY_SCENARIOS, type RoleplayScenario } from '@vietlearning/content';
import type { ChatCorrection } from '@vietlearning/contracts/api';
import { learnerStore, useLearner } from '@vietlearning/state';
import { ChatPanel } from '../chat/ChatPanel';
import { useChatSession } from '../chat/useChatSession';

const DIALECT_LABEL = { all: 'Mọi miền', north: 'Miền Bắc', central: 'Miền Trung', south: 'Miền Nam' } as const;
const btn = 'min-h-12 w-full rounded-xl px-4 font-extrabold';

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
  const allDone = done.length === scenario.tasks.length;

  const finish = () => {
    session.cancel();
    const store = learnerStore.getState();
    for (const c of corrections) {
      store.addCard({ itemRef: `roleplay:${c.corrected.toLowerCase()}`, front: c.corrected, back: `Bạn đã viết: “${c.original}”. ${c.explanation}`, source: 'conversation' });
    }
    setEnded(true);
  };

  if (ended) {
    return (
      <section role="status" className="flex flex-col gap-3 rounded-2xl border border-line-strong bg-surface p-4 shadow-card">
        <h2 className="m-0 text-xl font-black text-ink">
          Tổng kết: {done.length}/{scenario.tasks.length} nhiệm vụ
        </h2>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {scenario.tasks.map((t, i) => (
            <li key={t} className="text-[15px]">
              {done.includes(i) ? '✅' : '⬜'} {t}
            </li>
          ))}
        </ul>
        <h3 className="m-0 text-lg font-extrabold text-ink">Lỗi cần nhớ ({corrections.length})</h3>
        {corrections.length === 0 ? (
          <p className="m-0 text-[15px] text-ink-soft">Không có lỗi nào được sửa. Giỏi lắm!</p>
        ) : (
          <>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {corrections.map((c, i) => (
                <li key={i} className="rounded-xl bg-surface-2 p-2 text-[15px]">
                  <s className="text-ink-muted">{c.original}</s> → <strong lang="vi">{c.corrected}</strong>
                </li>
              ))}
            </ul>
            <p className="m-0 text-sm text-ink-muted">Đã lưu vào thẻ ôn tập (SM-2).</p>
          </>
        )}
        <button type="button" className={`${btn} bg-accent text-accent-ink`} onClick={onExit}>
          Chọn kịch bản khác
        </button>
      </section>
    );
  }

  return (
    <>
      <section aria-labelledby="ct-tasks" className="flex flex-col gap-2 rounded-2xl border border-line-strong bg-surface p-4 shadow-card">
        <h2 id="ct-tasks" className="m-0 text-lg font-extrabold text-ink">
          {scenario.title} · {scenario.location}
        </h2>
        <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Nhiệm vụ">
          {scenario.tasks.map((t, i) => (
            <li key={t} className="text-[15px]">
              <span aria-hidden="true">{done.includes(i) ? '✅' : '⬜'} </span>
              <span className={done.includes(i) ? 'text-ink-muted line-through' : 'text-ink'}>{t}</span>
              <span className="sr-only">{done.includes(i) ? ' (đã xong)' : ' (chưa xong)'}</span>
            </li>
          ))}
        </ul>
      </section>
      <ChatPanel
        session={session}
        tutorName="Nhân vật"
        placeholder="Nói gì đó với nhân vật…"
        emptyHint={`Bạn đang ở ${scenario.location}. Hãy bắt đầu bằng nhiệm vụ đầu tiên: “${scenario.tasks[0]}”.`}
      />
      <button type="button" className={`${btn} ${allDone ? 'bg-accent text-accent-ink' : 'border border-line-strong bg-surface-2 text-ink'}`} onClick={finish}>
        {allDone ? 'Hoàn thành! Xem tổng kết' : 'Kết thúc và xem tổng kết'}
      </button>
    </>
  );
}

/** Màn hình M7: chọn 1 trong 4 tình huống, nhập vai với nhân vật, theo dõi nhiệm vụ, tổng kết lỗi. */
export function RoleplayScreen() {
  const [scenario, setScenario] = useState<RoleplayScenario | null>(null);
  return (
    <Frame
      title="Nhập vai"
      action={
        <Link to="/hoi-thoai" className="flex min-h-11 items-center rounded-xl border border-line-strong bg-surface px-3 text-sm font-bold text-ink no-underline">
          💬 Trò chuyện
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
                <span className="text-lg font-extrabold text-ink">{s.title}</span>
                <span className="text-sm text-ink-muted">
                  {s.location} · {DIALECT_LABEL[s.targetDialect]} · {s.tasks.length} nhiệm vụ
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}
