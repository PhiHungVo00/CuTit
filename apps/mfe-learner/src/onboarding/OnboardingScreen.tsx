import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CEFR, cefrLabel, learnerStore, useLearner, type Dialect } from '@vietlearning/state';
import { ChoiceGroup, ScreenFrame, card, primaryBtn, secondaryBtn } from '../common/ui';
import { describePlacementError, newSessionId, placementNext, type PlacementFailure, type PlacementQuestion } from './placementClient';

const GOALS = [
  { value: 'daily', label: 'Giao tiếp hằng ngày', hint: 'Chào hỏi, mua sắm, hỏi đường' },
  { value: 'travel', label: 'Du lịch Việt Nam' },
  { value: 'work', label: 'Công việc', hint: 'Họp, email, đồng nghiệp người Việt' },
  { value: 'family', label: 'Gia đình, cội nguồn', hint: 'Nói chuyện với ông bà, họ hàng' }
];

const LANGS = [
  { value: 'en', label: 'English' },
  { value: 'ko', label: '한국어' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
  { value: 'fr', label: 'Français' },
  { value: 'other', label: 'Ngôn ngữ khác' }
];

const DIALECTS: { value: Dialect; label: string; hint: string }[] = [
  { value: 'north', label: 'Miền Bắc', hint: 'Hà Nội — giọng chuẩn trong sách giáo khoa' },
  { value: 'central', label: 'Miền Trung', hint: 'Huế, Đà Nẵng' },
  { value: 'south', label: 'Miền Nam', hint: 'TP. Hồ Chí Minh' }
];

const LEVEL_HINT = ['Mới bắt đầu', 'Biết câu cơ bản', 'Giao tiếp được việc quen', 'Nói khá trôi chảy', 'Thành thạo', 'Gần như người bản ngữ'];

type Step =
  | { kind: 'goal' }
  | { kind: 'lang' }
  | { kind: 'dialect' }
  | { kind: 'level' }
  | { kind: 'quiz'; sessionId: string; question: PlacementQuestion | null; busy: boolean; error: PlacementFailure | null }
  | { kind: 'manual' }
  | { kind: 'result'; level: number; fromTest: boolean };

const STEP_NO: Record<Step['kind'], number> = { goal: 1, lang: 2, dialect: 3, level: 4, quiz: 4, manual: 4, result: 4 };

/** Màn hình M11: chọn mục tiêu, ngôn ngữ mẹ đẻ, phương ngữ, rồi xếp lớp (A5 ở Gateway) hoặc tự chọn trình độ. */
export function OnboardingScreen() {
  const navigate = useNavigate();
  const profile = useLearner((s) => s.profile);
  const [goal, setGoal] = useState<string | null>(profile.goal);
  const [lang, setLang] = useState<string | null>(profile.onboarded ? profile.nativeLang : null);
  const [dialect, setDialect] = useState<Dialect | null>(profile.onboarded ? profile.dialect : null);
  const [manualLevel, setManualLevel] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'goal' });
  const headingRef = useRef<HTMLHeadingElement>(null);
  /** Chặn kết quả cũ đè lên khi người dùng đã rời bước làm bài */
  const quizToken = useRef(0);

  // Mỗi bước mới: đưa focus về tiêu đề bước (trình đọc màn hình đọc ngay nội dung mới)
  useEffect(() => {
    headingRef.current?.focus();
  }, [step.kind, step.kind === 'quiz' ? step.question?.id : null]);

  const runQuiz = async (sessionId: string, answer?: { questionId: string; choice: number }, current: PlacementQuestion | null = null) => {
    const token = ++quizToken.current;
    setStep({ kind: 'quiz', sessionId, question: current, busy: true, error: null });
    try {
      const next = await placementNext(sessionId, answer);
      if (token !== quizToken.current) return;
      if (next.finished) setStep({ kind: 'result', level: next.level, fromTest: true });
      else setStep({ kind: 'quiz', sessionId, question: next.question, busy: false, error: null });
    } catch (err) {
      if (token !== quizToken.current) return;
      setStep({ kind: 'quiz', sessionId, question: current, busy: false, error: await describePlacementError(err) });
    }
  };

  const leaveQuiz = (to: Step) => {
    quizToken.current++;
    setStep(to);
  };

  const finish = (level: number) => {
    learnerStore.getState().completeOnboarding({ level, goal, nativeLang: lang ?? 'other', dialect: dialect ?? 'north' });
    navigate('/');
  };

  const back = () => {
    const prev: Partial<Record<Step['kind'], Step['kind']>> = { lang: 'goal', dialect: 'lang', level: 'dialect', quiz: 'level', manual: 'level', result: 'level' };
    const k = prev[step.kind];
    if (k) leaveQuiz({ kind: k } as Step);
  };

  const heading = (text: string) => (
    <h2 ref={headingRef} tabIndex={-1} className="m-0 text-xl font-black leading-snug text-ink outline-none">
      {text}
    </h2>
  );

  return (
    <ScreenFrame title="Bắt đầu">
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Các bước làm quen" aria-valuemin={1} aria-valuemax={4} aria-valuenow={STEP_NO[step.kind]}>
          <div className="h-full bg-accent transition-[width]" style={{ width: `${(STEP_NO[step.kind] / 4) * 100}%` }} />
        </div>
        <span className="text-sm font-bold text-ink-muted">Bước {STEP_NO[step.kind]}/4</span>
      </div>

      <section className={card} aria-live="polite">
        {step.kind === 'goal' && (
          <>
            {heading('Chào bạn! Bạn học tiếng Việt để làm gì?')}
            <ChoiceGroup name="goal" legend="Mục tiêu chính" value={goal} options={GOALS} onChange={setGoal} />
            <button type="button" className={primaryBtn} disabled={!goal} onClick={() => setStep({ kind: 'lang' })}>
              Tiếp →
            </button>
          </>
        )}

        {step.kind === 'lang' && (
          <>
            {heading('Ngôn ngữ mẹ đẻ của bạn?')}
            <p className="m-0 text-[15px] text-ink-soft">Bé Cu Tít dùng để giải thích lỗi dễ hiểu hơn.</p>
            <ChoiceGroup name="lang" legend="Ngôn ngữ" value={lang} options={LANGS} onChange={setLang} />
            <button type="button" className={primaryBtn} disabled={!lang} onClick={() => setStep({ kind: 'dialect' })}>
              Tiếp →
            </button>
          </>
        )}

        {step.kind === 'dialect' && (
          <>
            {heading('Bạn muốn nghe giọng miền nào?')}
            <p className="m-0 text-[15px] text-ink-soft">Có thể đổi lại bất cứ lúc nào trong Tùy chỉnh.</p>
            <ChoiceGroup name="dialect" legend="Phương ngữ" value={dialect} options={DIALECTS} onChange={setDialect} />
            <button type="button" className={primaryBtn} disabled={!dialect} onClick={() => setStep({ kind: 'level' })}>
              Tiếp →
            </button>
          </>
        )}

        {step.kind === 'level' && (
          <>
            {heading('Trình độ hiện tại của bạn')}
            <button type="button" className={primaryBtn} onClick={() => void runQuiz(newSessionId())}>
              Làm bài xếp lớp (8–12 câu)
            </button>
            <p className="m-0 text-sm text-ink-muted">Câu hỏi khó dần hoặc dễ dần theo câu trả lời của bạn. Cần kết nối mạng.</p>
            <button type="button" className={secondaryBtn} onClick={() => setStep({ kind: 'manual' })}>
              Tôi tự chọn trình độ
            </button>
            <button type="button" className={secondaryBtn} onClick={() => setStep({ kind: 'result', level: 1, fromTest: false })}>
              Tôi mới bắt đầu
            </button>
          </>
        )}

        {step.kind === 'quiz' && (
          <>
            <p className="m-0 text-xs font-bold uppercase tracking-wide text-ink-muted">
              Bài xếp lớp{step.question ? ` · Câu ${step.question.index}/${step.question.maxQuestions} (tối đa)` : ''}
            </p>
            {step.question ? heading(step.question.prompt) : !step.error && heading('Đang chuẩn bị câu hỏi…')}
            {step.question && (
              <div className="grid gap-2" role="group" aria-label="Lựa chọn">
                {step.question.options.map((o, i) => (
                  <button
                    key={o}
                    type="button"
                    lang="vi"
                    disabled={step.busy}
                    onClick={() => void runQuiz(step.sessionId, { questionId: step.question!.id, choice: i }, step.question)}
                    className="min-h-14 rounded-xl border-2 border-line bg-surface-2 px-3 text-left text-lg font-bold text-ink disabled:opacity-60"
                  >
                    {o}
                  </button>
                ))}
              </div>
            )}
            {step.busy && (
              <p role="status" className="m-0 text-sm text-ink-muted">
                Đang xử lý…
              </p>
            )}
            {step.error && (
              <div role="alert" className="flex flex-col gap-2 rounded-xl bg-danger-soft p-3 text-danger-ink">
                {heading(step.error.offline ? 'Không làm được bài xếp lớp lúc này' : 'Có lỗi xảy ra')}
                <p className="m-0 text-[15px]">{step.error.message}</p>
                {step.question && (
                  // Gọi lại không kèm trả lời => Gateway gửi lại câu đang chờ (không mất tiến độ nếu câu trả lời chưa tới máy chủ)
                  <button type="button" className={primaryBtn} onClick={() => void runQuiz(step.sessionId, undefined, step.question)}>
                    Thử lại
                  </button>
                )}
                <button type="button" className={secondaryBtn} onClick={() => void runQuiz(newSessionId())}>
                  Làm lại từ đầu
                </button>
                <button type="button" className={secondaryBtn} onClick={() => leaveQuiz({ kind: 'manual' })}>
                  Tự chọn trình độ
                </button>
              </div>
            )}
          </>
        )}

        {step.kind === 'manual' && (
          <>
            {heading('Chọn trình độ gần đúng nhất')}
            <ChoiceGroup
              name="level"
              legend="Khung CEFR"
              value={manualLevel}
              options={CEFR.map((c, i) => ({ value: String(i + 1), label: c, hint: LEVEL_HINT[i] }))}
              onChange={setManualLevel}
            />
            <button type="button" className={primaryBtn} disabled={!manualLevel} onClick={() => setStep({ kind: 'result', level: Number(manualLevel), fromTest: false })}>
              Tiếp →
            </button>
          </>
        )}

        {step.kind === 'result' && (
          <div className="flex flex-col items-center gap-3 text-center">
            <span aria-hidden="true" className="text-5xl">
              🏮
            </span>
            {heading(`Trình độ của bạn: ${cefrLabel(step.level)}`)}
            <p className="m-0 text-[15px] text-ink-soft">
              {LEVEL_HINT[step.level - 1]}. {step.fromTest ? 'Kết quả từ bài xếp lớp; ' : ''}Bài luyện sẽ tự điều chỉnh theo tiến bộ của bạn.
            </p>
            <button type="button" className={primaryBtn} onClick={() => finish(step.level)}>
              Bắt đầu học
            </button>
          </div>
        )}
      </section>

      {step.kind !== 'goal' && (
        <button type="button" className={secondaryBtn} onClick={back}>
          ← Quay lại
        </button>
      )}
    </ScreenFrame>
  );
}
