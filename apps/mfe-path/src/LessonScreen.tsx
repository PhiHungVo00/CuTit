import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { COURSE, findLesson, findWord, PitchReferenceFlyweight, type ToneId } from '@vietlearning/content';
import { useLearner, useUiLanguage } from '@vietlearning/state';
import { prefetchPack } from '@vietlearning/exercises';
import { progressStore, useProgress } from '@vietlearning/state/progress';
import { useT } from './i18n';
import { nextLesson } from './path/pathModel';
import { lessonHref } from './path/lessonHref';
import { syncReminders } from './reminders';
import { SessionRunner, type SessionOutcome } from './session/SessionRunner';
import { Page, primaryBtn, secondaryBtn } from './ui';

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
        <Link to="/" className={primaryBtn}>{t('backToPath')}</Link>
      </Page>
    );
  }
  const { unit, lesson } = found;
  // Bài nhập vai cuối unit (GĐ3) sống ở màn nhập vai: chuyển hướng qua URL
  if (lesson.roleplay) return <Navigate replace to={lessonHref(lesson)} />;
  const lessonTitle = en ? lesson.titleEn : lesson.title;

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
            const r = progressStore.getState().completeLesson(lessonId, { total: o.total, firstTryCorrect: o.firstTryCorrect });
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
      <section role="status" aria-labelledby="ct-sum" className="flex flex-col items-center gap-3 rounded-2xl border border-line-strong bg-surface p-5 text-center shadow-card">
        <span aria-hidden="true" className="text-5xl">
          {pct >= 80 ? '🏮' : '🎋'}
        </span>
        <h1 id="ct-sum" className="m-0 text-xl font-black text-heading">
          {t('summaryTitle', { lesson: lessonTitle })}
        </h1>
        <p className="m-0 text-3xl font-black text-accent">{t('summaryXp', { n: result.xp })}</p>
        <p className="m-0 text-[15px] text-ink">{t('summaryAccuracy', { pct })}</p>
        {result.skipped > 0 && <p className="m-0 text-sm text-ink-soft">{t('summarySkipped', { n: result.skipped })}</p>}
        {result.freezeEarned && <p className="m-0 text-sm font-bold text-heading">{t('summaryFreeze')}</p>}
        {result.mistakes.length > 0 && <p className="m-0 text-sm text-ink-soft">{t('summaryMistakes')}</p>}
      </section>

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
          <Link to={lessonHref(next)} className={primaryBtn}>
            {t('nextLesson', { lesson: en ? next.titleEn : next.title })}
          </Link>
        )}
        <Link to="/" className={nextIsSame ? primaryBtn : secondaryBtn}>
          {t('backToPath')}
        </Link>
        {!unit.reviewed && <p className="m-0 text-center text-xs italic text-ink-muted">{t('draftContent')}</p>}
      </div>
    </Page>
  );
}
