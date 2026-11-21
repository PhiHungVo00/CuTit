import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CEFR, cefrLabel, learnerStore, useLearner, type Dialect, type UiLanguage } from '@vietlearning/state';
import { Button, Card, CuTit } from '@vietlearning/ui';
import { ChoiceGroup, ScreenFrame } from '../common/ui';
import { useT } from '../i18n';
import { describePlacementError, newSessionId, placementNext, type PlacementFailure, type PlacementQuestion } from './placementClient';

const GOALS = ['daily', 'travel', 'work', 'family'] as const;
const GOALS_WITH_HINT = new Set<string>(['daily', 'work', 'family']);

/** Tên ngôn ngữ viết bằng chính ngôn ngữ đó: không dịch */
const LANGS = [
  { value: 'en', label: 'English' },
  { value: 'ko', label: '한국어' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
  { value: 'fr', label: 'Français' }
];

const UI_LANGS: { value: UiLanguage; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'vi', label: 'Tiếng Việt' }
];

const DIALECTS: Dialect[] = ['north', 'central', 'south'];
const levelKey = (n: number) => `level.${Math.min(6, Math.max(1, n))}` as 'level.1';

type Step =
  | { kind: 'goal' }
  | { kind: 'lang' }
  | { kind: 'dialect' }
  | { kind: 'level' }
  | { kind: 'quiz'; sessionId: string; question: PlacementQuestion | null; busy: boolean; error: PlacementFailure | null }
  | { kind: 'manual' }
  | { kind: 'result'; level: number; fromTest: boolean };

const STEP_NO: Record<Step['kind'], number> = { goal: 1, lang: 2, dialect: 3, level: 4, quiz: 4, manual: 4, result: 4 };

/** Màn hình M11: ngôn ngữ ứng dụng + mục tiêu, ngôn ngữ mẹ đẻ, phương ngữ, rồi xếp lớp (A5 ở Gateway) hoặc tự chọn trình độ. */
export function OnboardingScreen() {
  const navigate = useNavigate();
  const t = useT();
  const profile = useLearner((s) => s.profile);
  const uiLanguage = useLearner((s) => s.preferences.uiLanguage);
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
      setStep({ kind: 'quiz', sessionId, question: current, busy: false, error: await describePlacementError(err, t('sessionExpired')) });
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

  const heading = (text: string, lang?: string) => (
    <h2 ref={headingRef} tabIndex={-1} lang={lang} className="m-0 text-xl font-black leading-snug text-ink outline-none">
      {text}
    </h2>
  );

  const questionText = (q: PlacementQuestion) => (uiLanguage === 'en' && q.promptEn ? q.promptEn : q.prompt);

  return (
    <ScreenFrame title={t('startTitle')}>
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={t('stepsLabel')} aria-valuemin={1} aria-valuemax={4} aria-valuenow={STEP_NO[step.kind]}>
          <div className="h-full bg-accent transition-[width]" style={{ width: `${(STEP_NO[step.kind] / 4) * 100}%` }} />
        </div>
        <span className="text-sm font-bold text-ink-muted">{t('stepOf', { n: STEP_NO[step.kind] })}</span>
      </div>

      <Card role="region" aria-live="polite" elevated style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {step.kind === 'goal' && (
          <>
            <ChoiceGroup name="uilang" legend={t('uiLangLegend')} value={uiLanguage} options={UI_LANGS} onChange={(v) => learnerStore.getState().setPreferences({ uiLanguage: v })} />
            {heading(t('goalQ'))}
            <ChoiceGroup
              name="goal"
              legend={t('goalLegend')}
              value={goal}
              options={GOALS.map((g) => ({ value: g, label: t(`goal.${g}`), hint: GOALS_WITH_HINT.has(g) ? t(`goal.${g}.hint` as 'goal.daily.hint') : undefined }))}
              onChange={setGoal}
            />
            <Button disabled={!goal} onClick={() => setStep({ kind: 'lang' })} style={{ width: '100%' }}>
              {t('next')}
            </Button>
          </>
        )}

        {step.kind === 'lang' && (
          <>
            {heading(t('langQ'))}
            <p className="m-0 text-[15px] text-ink-soft">{t('langWhy')}</p>
            <ChoiceGroup name="lang" legend={t('langLegend')} value={lang} options={[...LANGS, { value: 'other', label: t('langOther') }]} onChange={setLang} />
            <Button disabled={!lang} onClick={() => setStep({ kind: 'dialect' })} style={{ width: '100%' }}>
              {t('next')}
            </Button>
          </>
        )}

        {step.kind === 'dialect' && (
          <>
            {heading(t('dialectQ'))}
            <p className="m-0 text-[15px] text-ink-soft">{t('dialectLater')}</p>
            <ChoiceGroup
              name="dialect"
              legend={t('dialectLegend')}
              value={dialect}
              options={DIALECTS.map((d) => ({ value: d, label: t(`dialect.${d}`), hint: t(`dialect.${d}.hint`) }))}
              onChange={setDialect}
            />
            <Button disabled={!dialect} onClick={() => setStep({ kind: 'level' })} style={{ width: '100%' }}>
              {t('next')}
            </Button>
          </>
        )}

        {step.kind === 'level' && (
          <>
            {heading(t('levelQ'))}
            <Button onClick={() => void runQuiz(newSessionId())} style={{ width: '100%' }}>
              {t('takeTest')}
            </Button>
            <p className="m-0 text-sm text-ink-muted">{t('testHint')}</p>
            <Button variant="secondary" onClick={() => setStep({ kind: 'manual' })} style={{ width: '100%' }}>
              {t('pickLevel')}
            </Button>
            <Button variant="secondary" onClick={() => setStep({ kind: 'result', level: 1, fromTest: false })} style={{ width: '100%' }}>
              {t('beginner')}
            </Button>
          </>
        )}

        {step.kind === 'quiz' && (
          <>
            <p className="m-0 text-xs font-bold uppercase tracking-wide text-ink-muted">
              {t('quizLabel')}
              {step.question ? t('quizProgress', { i: step.question.index, max: step.question.maxQuestions }) : ''}
            </p>
            {step.question ? heading(questionText(step.question), uiLanguage === 'en' && step.question.promptEn ? 'en' : 'vi') : !step.error && heading(t('preparing'))}
            {step.question && (
              <div className="grid gap-2" role="group" aria-label={t('choices')}>
                {step.question.options.map((o, i) => (
                  <Button
                    key={o}
                    variant="secondary"
                    lang="vi"
                    disabled={step.busy}
                    onClick={() => void runQuiz(step.sessionId, { questionId: step.question!.id, choice: i }, step.question)}
                    style={{ justifyContent: 'flex-start', textAlign: 'left', minHeight: 56, fontSize: '1.1rem' }}
                  >
                    {o}
                  </Button>
                ))}
              </div>
            )}
            {step.busy && (
              <p role="status" className="m-0 text-sm text-ink-muted">
                {t('processing')}
              </p>
            )}
            {step.error && (
              <div role="alert" className="flex flex-col gap-2 rounded-xl bg-danger-soft p-3 text-danger-ink">
                {heading(step.error.offline ? t('quizOffline') : t('errorTitle'))}
                <p className="m-0 text-[15px]">{step.error.message}</p>
                {step.question && (
                  // Gọi lại không kèm trả lời => Gateway gửi lại câu đang chờ (không mất tiến độ nếu câu trả lời chưa tới máy chủ)
                  <Button onClick={() => void runQuiz(step.sessionId, undefined, step.question)} style={{ width: '100%' }}>
                    {t('retry')}
                  </Button>
                )}
                <Button variant="secondary" onClick={() => void runQuiz(newSessionId())} style={{ width: '100%' }}>
                  {t('restart')}
                </Button>
                <Button variant="secondary" onClick={() => leaveQuiz({ kind: 'manual' })} style={{ width: '100%' }}>
                  {t('pickLevelShort')}
                </Button>
              </div>
            )}
          </>
        )}

        {step.kind === 'manual' && (
          <>
            {heading(t('manualQ'))}
            <ChoiceGroup
              name="level"
              legend={t('cefrLegend')}
              value={manualLevel}
              options={CEFR.map((c, i) => ({ value: String(i + 1), label: c, hint: t(levelKey(i + 1)) }))}
              onChange={setManualLevel}
            />
            <Button disabled={!manualLevel} onClick={() => setStep({ kind: 'result', level: Number(manualLevel), fromTest: false })} style={{ width: '100%' }}>
              {t('next')}
            </Button>
          </>
        )}

        {step.kind === 'result' && (
          <div className="flex flex-col items-center gap-3 text-center">
            <CuTit mood="khen" size={120} />
            {heading(t('yourLevel', { level: cefrLabel(step.level) }))}
            <p className="m-0 text-[15px] text-ink-soft">
              {t(levelKey(step.level))}. {step.fromTest ? t('fromTest') : ''}
              {t('adapts')}
            </p>
            <Button onClick={() => finish(step.level)} style={{ width: '100%' }}>
              {t('startLearning')}
            </Button>
          </div>
        )}
      </Card>

      {step.kind !== 'goal' && (
        <Button variant="secondary" onClick={back} style={{ width: '100%' }}>
          {t('back')}
        </Button>
      )}
    </ScreenFrame>
  );
}
