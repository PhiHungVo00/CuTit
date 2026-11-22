import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { COURSE, dialogueForUnit, findLesson, findWord, PitchReferenceFlyweight, type ToneId } from '@vietlearning/content';
import { useLearner, useUiLanguage } from '@vietlearning/state';
import { prefetchPack, type DialogueOutcome } from '@vietlearning/exercises';
import { progressStore, useProgress } from '@vietlearning/state/progress';
import { useT } from './i18n';
import { nextLesson } from './path/pathModel';
import { lessonHref } from './path/lessonHref';
import { defaultVisible, draftsEnabled } from './path/visibility';
import { syncReminders } from './reminders';
import { SessionRunner, type SessionOutcome } from './session/SessionRunner';
import { Button, Card, CuTit } from '@vietlearning/ui';
import { celebrateFinish, currentStreak } from './celebration';
import { useCountUp } from './useCountUp';
import { cardStack, LinkButton, Page } from './Page';

// GĐ4: thông báo huy hiệu mới — chunk lười riêng
const Motivation = lazy(() => import('./motivation/Motivation'));
// Tình huống rẽ nhánh cuối unit: bộ chạy nạp lười, chỉ unit nào có tình huống mới tải
const DialogueRunner = lazy(() => import('@vietlearning/exercises').then((m) => ({ default: m.DialogueRunner })));


interface Finished extends SessionOutcome {
  xp: number;
  freezeEarned: boolean;
}

/**
 * Phiên bài học /bai-hoc/:lessonId — 8–12 câu, câu sai quay lại cuối phiên, rồi màn tổng kết.
 * key theo id bài: từ tổng kết bấm “Học tiếp” sang bài khác thì dựng lại phiên mới (không giữ kết quả bài cũ).
 */
export function LessonScreen() {
  const { lessonId = '' } = useParams();
  return <LessonBody key={lessonId} lessonId={lessonId} />;
}

function LessonBody({ lessonId }: { lessonId: string }) {
  const t = useT();
  const en = useUiLanguage() === 'en';
  const navigate = useNavigate();
  const found = findLesson(lessonId);
  const [result, setResult] = useState<Finished | null>(null);
  const [summaryShown, setSummaryShown] = useState(false);
  const done = useProgress((s) => s.lessons);
  const testedOut = useProgress((s) => s.testedOut);
  const dialect = useLearner((s) => s.preferences.dialect);
  const unitId = found?.unit.id;
  // GĐ2: tải gói âm thanh dựng sẵn của unit theo miền đang chọn (lưu offline; lỗi thì đọc bằng TTS của máy)
  useEffect(() => {
    if (unitId) void prefetchPack(unitId, dialect);
  }, [unitId, dialect]);

  if (!found) {
    return (
      <Page>
        <p role="alert" className="m-0 text-ink">{t('notFound')}</p>
        <LinkButton to="/">{t('backToPath')}</LinkButton>
      </Page>
    );
  }
  const { unit, lesson } = found;
  // Tình huống cuối unit: chỉ mở khi có kịch bản đã duyệt (hoặc nháp ở bản dev); không thì về lộ trình, không treo phiên rỗng
  if (lesson.roleplay && !defaultVisible(lesson)) return <Navigate replace to="/" />;
  const lessonTitle = en ? lesson.titleEn : lesson.title;

  const dialogue = lesson.roleplay ? dialogueForUnit(unit.id, { includeUnreviewed: draftsEnabled() }) : undefined;
  if (lesson.roleplay && dialogue && (!result || !summaryShown)) {
    const finishDialogue = (o: DialogueOutcome) => {
      const streakBefore = currentStreak();
      // Quy ra thang 10 câu như một bài thường: `best` (điểm xưng hô) dùng cho huy hiệu “Nói được tình huống” (≥ 60%)
      const total = 10;
      const firstTryCorrect = Math.round(o.honorificScore * total);
      const r = progressStore.getState().completeLesson(lessonId, { total, firstTryCorrect });
      celebrateFinish(streakBefore, false); // âm 'hoan-thanh' đã do bộ chạy phát
      setResult({ total, firstTryCorrect, accuracy: o.honorificScore, skipped: 0, mistakes: [], weakTones: [], ...r });
      void syncReminders().catch(() => undefined);
    };
    return (
      <Page>
        <Suspense fallback={null}>
          <DialogueRunner key={lessonId} dialogue={dialogue} onDone={finishDialogue} onPractice={(id) => navigate(`/hoi-thoai?tinh-huong=${encodeURIComponent(id)}`)} />
        </Suspense>
        {result && <Button onClick={() => setSummaryShown(true)}>{t('seeSummary')}</Button>}
        {!dialogue.reviewed && <p className="m-0 text-center text-xs italic text-ink-muted">{t('draftContent')}</p>}
      </Page>
    );
  }

  if (!result) {
    return (
      <Page>
        <SessionRunner
          key={lessonId}
          refs={lesson.exercises}
          seedKey={lessonId}
          title={lessonTitle}
          onClose={() => navigate('/')}
          onFinish={(o) => {
            const streakBefore = currentStreak();
            const r = progressStore.getState().completeLesson(lessonId, { total: o.total, firstTryCorrect: o.firstTryCorrect });
            celebrateFinish(streakBefore);
            setResult({ ...o, ...r });
            void syncReminders().catch(() => undefined);
          }}
        />
      </Page>
    );
  }

  const words = [...new Set(lesson.exercises.flatMap((r) => (r.type === 'meaning' || r.type === 'listen' ? [findWord(r.word)?.vi ?? ''] : [])).filter(Boolean))];
  const next = nextLesson(COURSE, done, testedOut);
  const nextIsSame = next.id === lessonId;
  const pct = Math.round(result.accuracy * 100);

  return (
    <Page>
      <SummaryCard result={result} lessonTitle={lessonTitle} pct={pct} />

      <Suspense fallback={null}>
        <Motivation part="notice" />
      </Suspense>

      {words.length > 0 && (
        <section aria-labelledby="ct-sum-words" className="flex flex-col gap-2">
          <h2 id="ct-sum-words" className="m-0 text-sm font-bold text-ink-soft">{t('summaryWords')}</h2>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {words.map((w) => (
              <li key={w} lang="vi" className="rounded-xl bg-surface-2 px-3 py-2 font-bold text-ink">
                {w}
              </li>
            ))}
          </ul>
        </section>
      )}
      {result.weakTones.length > 0 && (
        <section aria-labelledby="ct-sum-tones" className="flex flex-col gap-2">
          <h2 id="ct-sum-tones" className="m-0 text-sm font-bold text-ink-soft">{t('summaryTones')}</h2>
          <p className="m-0 text-ink">{result.weakTones.map((id) => (en ? PitchReferenceFlyweight.get(id as ToneId).nameEn : PitchReferenceFlyweight.get(id as ToneId).name)).join(' · ')}</p>
        </section>
      )}

      <div className="flex flex-col gap-2">
        {!nextIsSame && (
          <LinkButton to={lessonHref(next)}>{t('nextLesson', { lesson: en ? next.titleEn : next.title })}</LinkButton>
        )}
        <LinkButton to="/" variant={nextIsSame ? 'primary' : 'secondary'}>
          {t('backToPath')}
        </LinkButton>
        {!unit.reviewed && <p className="m-0 text-center text-xs italic text-ink-muted">{t('draftContent')}</p>}
      </div>
    </Page>
  );
}

/** Thẻ tổng kết: XP đếm 0→n (600ms); độ chính xác chỉ hiện khi có ≥ 1 câu đúng ngay lần đầu, không thì mời ôn lại */
function SummaryCard({ result, lessonTitle, pct }: { result: Finished; lessonTitle: string; pct: number }) {
  const t = useT();
  const xp = useCountUp(result.xp);
  const mistakes = result.mistakes.length;
  return (
    <Card role="status" aria-labelledby="ct-sum" elevated style={{ ...cardStack, alignItems: 'center', textAlign: 'center' }}>
      <CuTit mood="an-mung" size={120} />
      <h1 id="ct-sum" className="m-0 text-xl font-black text-heading">
        {t('summaryTitle', { lesson: lessonTitle })}
      </h1>
      <p className="m-0 text-3xl font-black text-accent">
        <span className="sr-only" data-testid="xp-final">
          {t('summaryXp', { n: result.xp })}
        </span>
        <span aria-hidden="true">
          +<span data-testid="xp-count">{xp}</span> XP
        </span>
      </p>
      {result.firstTryCorrect >= 1 && <p className="m-0 text-[15px] text-ink">{t('summaryAccuracy', { pct })}</p>}
      {result.skipped > 0 && <p className="m-0 text-sm text-ink-soft">{t('summarySkipped', { n: result.skipped })}</p>}
      {result.freezeEarned && <p className="m-0 text-sm font-bold text-heading">{t('summaryFreeze')}</p>}
      {mistakes > 0 && result.firstTryCorrect >= 1 && <p className="m-0 text-sm text-ink-soft">{t('summaryMistakes')}</p>}
      {mistakes > 0 && result.firstTryCorrect < 1 && (
        <>
          <p className="m-0 text-[15px] font-bold text-ink">{t('summaryReview', { n: mistakes })}</p>
          <LinkButton to="/on-tap" variant="secondary">
            {t('summaryReviewBtn')}
          </LinkButton>
        </>
      )}
    </Card>
  );
}
