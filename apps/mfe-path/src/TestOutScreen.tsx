import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { COURSE } from '@vietlearning/content';
import { useUiLanguage } from '@vietlearning/state';
import { progressStore } from '@vietlearning/state/progress';
import { useT } from './i18n';
import { TEST_OUT_PASS } from './path/pathModel';
import { SessionRunner } from './session/SessionRunner';
import { card, Page, primaryBtn, secondaryBtn } from './ui';

/**
 * Kiểm tra để vượt unit /kiem-tra/:unitId — bộ câu cố định của unit, không làm lại câu sai,
 * đạt ≥ 80% thì mọi bài trong unit tính là xong. Chưa đạt: không phạt, bài vẫn mở.
 * (Không tái hiện A5 ở client: A5 thuộc Gateway; đây chỉ là ngưỡng đạt trên bộ câu cố định.)
 */
export function TestOutScreen() {
  const { unitId = '' } = useParams();
  return <TestOutBody key={unitId} unitId={unitId} />;
}

function TestOutBody({ unitId }: { unitId: string }) {
  const t = useT();
  const en = useUiLanguage() === 'en';
  const navigate = useNavigate();
  const unit = COURSE.units.find((u) => u.id === unitId);
  const [phase, setPhase] = useState<'intro' | 'run' | { pct: number; passed: boolean; xp: number }>('intro');
  const [attempt, setAttempt] = useState(0);

  if (!unit) {
    return (
      <Page>
        <p role="alert" className="m-0 text-ink">{t('notFound')}</p>
        <Link to="/" className={primaryBtn}>{t('backToPath')}</Link>
      </Page>
    );
  }
  const title = en ? unit.titleEn : unit.title;
  const pass = Math.round(TEST_OUT_PASS * 100);

  if (phase === 'run') {
    return (
      <Page>
        <SessionRunner
          key={attempt}
          refs={unit.testOut}
          seedKey={`${unit.id}-test-${attempt}`}
          maxRetries={0}
          title={title}
          onClose={() => navigate('/')}
          onFinish={(o) => {
            const passed = o.total > 0 && o.accuracy >= TEST_OUT_PASS;
            const xp = passed ? progressStore.getState().passTestOut(unit.id) : 0;
            setPhase({ pct: Math.round(o.accuracy * 100), passed, xp });
          }}
        />
      </Page>
    );
  }

  return (
    <Page>
      <header className="flex flex-col gap-2 border-b-2 border-line pb-4">
        <h1 className="m-0 text-[26px] font-black leading-tight tracking-tight text-heading">{t('testOutTitle', { unit: title })}</h1>
        <p className="m-0 text-[15px] text-ink-soft">{t('testOutIntro', { n: unit.testOut.length, pct: pass })}</p>
      </header>
      {typeof phase === 'object' && (
        <section role="status" className={`${card} text-center`}>
          <p className="m-0 text-lg font-bold text-heading">
            {phase.passed ? t('testOutPassed', { pct: phase.pct, xp: phase.xp }) : t('testOutFailed', { pct: phase.pct })}
          </p>
        </section>
      )}
      {(phase === 'intro' || (typeof phase === 'object' && !phase.passed)) && (
        <button
          type="button"
          className={primaryBtn}
          onClick={() => {
            setAttempt((a) => a + 1);
            setPhase('run');
          }}
        >
          {phase === 'intro' ? t('testOutStart') : t('testOutAgain')}
        </button>
      )}
      <Link to="/" className={secondaryBtn}>
        {t('backToPath')}
      </Link>
    </Page>
  );
}
