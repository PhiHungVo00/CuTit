import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDeviceSpeech } from '@vietlearning/native';
import { dueCards, learnerStore, speechRate, useLearner } from '@vietlearning/state';
import { generateSession, type ChoiceDrill, type Drill, type MatchDrill, type RepeatDrill } from './generateDrills';

const say = (text: string) => getDeviceSpeech().speak(text, { rate: speechRate(0.85) }).catch(() => undefined);

const TYPE_LABEL: Record<Drill['type'], string> = {
  quiz: 'Trắc nghiệm',
  fill: 'Điền từ',
  listen: 'Nghe chọn',
  match: 'Ghép từ',
  repeat: 'Đọc lại'
};

/** Kết quả một bài: quality 0–5 cho SM-2 */
type Done = (quality: number, correct: boolean, reviewBack: string) => void;

function ChoiceView({ drill, onDone }: { drill: ChoiceDrill; onDone: Done }) {
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => {
    if (drill.speak) void say(drill.speak);
  }, [drill]);
  const correct = chosen === drill.answer;
  return (
    <div className="flex flex-col gap-3">
      {drill.speak && (
        <button type="button" onClick={() => say(drill.speak!)} className="min-h-12 self-start rounded-xl border border-line bg-surface-2 px-4 font-bold text-ink">
          🔈 Nghe lại
        </button>
      )}
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Lựa chọn">
        {drill.options.map((o) => {
          const state = chosen === null ? 'idle' : o === drill.answer ? 'right' : o === chosen ? 'wrong' : 'idle';
          return (
            <button
              key={o}
              type="button"
              disabled={chosen !== null}
              onClick={() => setChosen(o)}
              lang="vi"
              className={[
                'min-h-14 rounded-xl border-2 px-2 text-lg font-bold',
                state === 'right' ? 'border-accent bg-accent text-accent-ink' : state === 'wrong' ? 'border-danger bg-danger-soft text-danger-ink' : 'border-line bg-surface-2 text-ink'
              ].join(' ')}
            >
              {o}
            </button>
          );
        })}
      </div>
      {chosen !== null && (
        <div role="status" className={['rounded-xl p-3 text-[15px]', correct ? 'bg-accent-soft text-heading' : 'bg-danger-soft text-danger-ink'].join(' ')}>
          <strong>{correct ? 'Đúng rồi! ' : `Chưa đúng. Đáp án: “${drill.answer}”. `}</strong>
          {drill.explanation}
          <button type="button" onClick={() => onDone(correct ? 5 : 1, correct, drill.answer)} className="mt-2 block min-h-12 w-full rounded-xl bg-accent font-extrabold text-accent-ink">
            Tiếp →
          </button>
        </div>
      )}
    </div>
  );
}

function MatchView({ drill, onDone }: { drill: MatchDrill; onDone: Done }) {
  const rights = useMemo(() => [...drill.pairs.map((p) => p.right)].sort((a, b) => a.localeCompare(b, 'vi')), [drill]);
  const [left, setLeft] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const finished = matched.length === drill.pairs.length;

  const tryRight = (r: string) => {
    if (!left) return;
    const pair = drill.pairs.find((p) => p.left === left)!;
    if (pair.right === r) setMatched((m) => [...m, left]);
    else setMistakes((x) => x + 1);
    setLeft(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-ink-muted">Chạm một từ miền Bắc, rồi chạm từ miền Nam cùng nghĩa.</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-2" role="group" aria-label="Miền Bắc">
          {drill.pairs.map((p) => (
            <button
              key={p.left}
              type="button"
              aria-pressed={left === p.left}
              disabled={matched.includes(p.left)}
              onClick={() => setLeft(p.left)}
              className={['min-h-12 rounded-xl border-2 font-bold', matched.includes(p.left) ? 'border-accent bg-accent-soft text-heading' : left === p.left ? 'border-accent bg-surface text-ink' : 'border-line bg-surface-2 text-ink'].join(' ')}
            >
              {p.left}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2" role="group" aria-label="Miền Nam">
          {rights.map((r) => {
            const done = drill.pairs.some((p) => p.right === r && matched.includes(p.left));
            return (
              <button
                key={r}
                type="button"
                disabled={done || !left}
                onClick={() => tryRight(r)}
                className={['min-h-12 rounded-xl border-2 font-bold disabled:opacity-60', done ? 'border-accent bg-accent-soft text-heading' : 'border-line bg-surface-2 text-ink'].join(' ')}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>
      {mistakes > 0 && <p className="m-0 text-sm text-danger">Ghép sai {mistakes} lần</p>}
      {finished && (
        <button type="button" onClick={() => onDone(mistakes === 0 ? 5 : mistakes === 1 ? 3 : 1, mistakes === 0, drill.pairs.map((p) => `${p.left} = ${p.right}`).join(', '))} className="min-h-12 rounded-xl bg-accent font-extrabold text-accent-ink">
          Tiếp →
        </button>
      )}
    </div>
  );
}

function RepeatView({ drill, onDone }: { drill: RepeatDrill; onDone: Done }) {
  return (
    <div className="flex flex-col gap-3">
      <p lang="vi" className="m-0 rounded-xl bg-sunken p-3 text-xl font-extrabold text-ink">
        “{drill.text}”
      </p>
      <p className="m-0 text-sm text-ink-soft">{drill.translation}</p>
      <button type="button" onClick={() => say(drill.text)} className="min-h-12 self-start rounded-xl border border-line bg-surface-2 px-4 font-bold text-ink">
        🔈 Nghe mẫu
      </button>
      <p className="m-0 text-sm text-ink-muted">Đọc to theo mẫu rồi tự đánh giá (chấm thanh điệu tự động có ở mục Phát âm).</p>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Tự đánh giá">
        <button type="button" onClick={() => onDone(2, false, drill.text)} className="min-h-12 rounded-xl border border-line bg-danger-soft font-bold text-danger-ink">
          Khó
        </button>
        <button type="button" onClick={() => onDone(4, true, drill.text)} className="min-h-12 rounded-xl border border-line bg-surface-2 font-bold text-ink">
          Được
        </button>
        <button type="button" onClick={() => onDone(5, true, drill.text)} className="min-h-12 rounded-xl bg-accent font-bold text-accent-ink">
          Dễ
        </button>
      </div>
    </div>
  );
}

/**
 * Màn hình M5: phiên 8 bài thích ứng (5 dạng). Bài sinh theo mẫu từ kho nội dung (chạy offline);
 * sai => thành thẻ ôn SM-2 và quay lại ở phiên sau.
 */
export function DrillScreen() {
  const level = useLearner((s) => s.profile.level);
  const recordAttempt = useLearner((s) => s.recordAttempt);
  const addCard = useLearner((s) => s.addCard);
  const reviewCard = useLearner((s) => s.reviewCard);
  const addStudyTime = useLearner((s) => s.addStudyTime);
  const [seed, setSeed] = useState(() => Date.now() % 100000);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [startedAt] = useState(() => Date.now());

  const session = useMemo(() => {
    const dueKeys = dueCards(learnerStore.getState().srs)
      .filter((c) => c.itemRef.startsWith('drill:'))
      .map((c) => c.itemRef.slice('drill:'.length));
    return generateSession({ level, seed, dueKeys });
  }, [level, seed]);

  const drill = session[index];
  const finished = index >= session.length;

  useEffect(() => {
    if (finished) addStudyTime((Date.now() - startedAt) / 1000);
  }, [finished, addStudyTime, startedAt]);

  const onDone: Done = (quality, correct, back) => {
    const ref = `drill:${drill.key}`;
    recordAttempt('drill', correct);
    if (!correct) addCard({ itemRef: ref, front: drill.prompt, back, source: 'drill' });
    if (learnerStore.getState().srs[ref]) reviewCard(ref, quality);
    if (correct) setScore((s) => s + 1);
    setIndex((i) => i + 1);
  };

  return (
    <div className="min-h-dvh bg-canvas px-4 pb-8 pt-[calc(16px+env(safe-area-inset-top))] font-sans text-ink">
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">
        <header className="flex flex-col gap-2 border-b-2 border-line pb-4">
          <div className="flex items-center justify-between gap-2">
            <h1 className="m-0 text-[26px] font-black leading-tight tracking-tight text-heading">Luyện tập</h1>
            <Link to="/ghep-cau" className="flex min-h-11 items-center rounded-xl border border-line-strong bg-surface px-3 text-sm font-bold text-ink no-underline">
              🧱 Ghép câu
            </Link>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Tiến độ phiên" aria-valuemin={0} aria-valuemax={session.length} aria-valuenow={Math.min(index, session.length)}>
            <div className="h-full bg-accent transition-[width]" style={{ width: `${(Math.min(index, session.length) / session.length) * 100}%` }} />
          </div>
        </header>

        {!finished && drill && (
          <section key={`${seed}-${index}`} aria-labelledby="ct-drill-q" className="flex flex-col gap-3 rounded-2xl border border-line-strong bg-surface p-4 shadow-card">
            <p className="m-0 text-xs font-bold uppercase tracking-wide text-ink-muted">
              {TYPE_LABEL[drill.type]} · Bài {index + 1}/{session.length}
            </p>
            <h2 id="ct-drill-q" className="m-0 text-lg font-extrabold leading-snug text-ink">
              {drill.prompt}
            </h2>
            {(drill.type === 'quiz' || drill.type === 'fill' || drill.type === 'listen') && <ChoiceView drill={drill} onDone={onDone} />}
            {drill.type === 'match' && <MatchView drill={drill} onDone={onDone} />}
            {drill.type === 'repeat' && <RepeatView drill={drill} onDone={onDone} />}
          </section>
        )}

        {finished && (
          <section role="status" className="flex flex-col items-center gap-3 rounded-2xl border border-line-strong bg-surface p-6 text-center shadow-card">
            <span aria-hidden="true" className="text-5xl">
              {score >= session.length - 1 ? '🏮' : '🎋'}
            </span>
            <h2 className="m-0 text-xl font-black text-ink">
              Xong phiên! {score}/{session.length} bài đúng
            </h2>
            <p className="m-0 text-[15px] text-ink-soft">Bài sai đã được lưu để ôn lại theo lịch SM-2.</p>
            <button
              type="button"
              onClick={() => {
                setSeed((s) => s + 1);
                setIndex(0);
                setScore(0);
              }}
              className="min-h-12 w-full rounded-xl bg-accent font-extrabold text-accent-ink"
            >
              Phiên mới
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
