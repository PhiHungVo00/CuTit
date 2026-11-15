import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { HONORIFIC_PAIRS_20 } from '@vietlearning/content';
import { useLearner } from '@vietlearning/state';
import { CuTitWisdomCard } from './CuTitWisdomCard';
import { useT } from '../i18n';

// Drawer (kèm Radix Dialog ~13KB gzip) chỉ tải khi người dùng cần: tải trước lúc chạm nút, mở khi nhả tay
const loadDrawer = () => import('./HonorificExplorerDrawer');
const HonorificExplorerDrawer = lazy(() => loadDrawer().then((m) => ({ default: m.HonorificExplorerDrawer })));
import { ControlPanel } from './honorific/ControlPanel';
import { SentencePanel } from './honorific/SentencePanel';
import { useHonorificPlayground } from './honorific/useHonorificPlayground';
import { type Theme } from './honorific/options';

export interface HonorificMatrixScreenProps {
  /** Giao diện ban đầu khi màn hình tự quản lý theme */
  initialTheme?: Theme;
  /** Truyền vào để màn hình cha điều khiển theme (controlled) */
  theme?: Theme;
  onThemeChange?: (theme: Theme) => void;
  onPairChange?: (pair: { speaker: string; listener: string; pairId: string }) => void;
}

/**
 * Màn hình M3: Ma trận đại từ xưng hô (Thuật toán A6).
 * Logic nằm trong useHonorificPlayground; màu lấy từ design tokens qua data-theme,
 * nên đổi giao diện không remount và giữ nguyên lựa chọn của người học.
 */
export function HonorificMatrixScreen({ initialTheme = 'dark', theme: themeProp, onThemeChange, onPairChange }: HonorificMatrixScreenProps) {
  const t = useT();
  const en = useLearner((s) => s.preferences.uiLanguage) === 'en';
  const [themeState, setThemeState] = useState<Theme>(initialTheme);
  const theme = themeProp ?? themeState;
  const setTheme = (next: Theme) => {
    if (themeProp === undefined) setThemeState(next);
    onThemeChange?.(next);
  };

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(false);
  const drawerButtonRef = useRef<HTMLButtonElement>(null);
  const openDrawer = () => {
    setDrawerMounted(true);
    setDrawerOpen(true);
  };
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const pg = useHonorificPlayground();
  const { state, result } = pg;

  useEffect(() => {
    onPairChange?.({ speaker: result.speaker, listener: result.listener, pairId: result.pairId });
  }, [result.speaker, result.listener, result.pairId, onPairChange]);

  const relationName = t(`relation.${state.relation}`);
  const contextLabel = `${t(`context.${state.contextStep}`)} • ${t(`age.${state.ageStep}`)}`;
  // Giao diện tiếng Anh: lời giải thích/lời dặn lấy từ bản dịch của cặp tương ứng (A6 trả pairId)
  const pairEn = en ? HONORIFIC_PAIRS_20.find((p) => p.id === result.pairId) : undefined;
  const wisdom = pairEn?.wisdomEn ?? result.wisdomTip;
  const explanation = pairEn?.explanationEn ?? result.explanation;

  return (
    <div data-theme={theme} className="min-h-dvh bg-canvas px-4 pb-8 pt-[calc(16px+env(safe-area-inset-top))] font-sans text-ink">
      <div className="mx-auto flex max-w-[560px] flex-col gap-5">
        <header className="flex flex-col gap-3 border-b-2 border-line pb-4">
          <h1 className="m-0 text-[26px] font-black leading-tight tracking-tight text-heading">{t('matrixTitle')}</h1>
          <p className="m-0 text-[15px] text-ink-soft">{t('matrixIntro')}</p>

          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label={t('themeLabel')} className="inline-flex rounded-xl border border-line bg-surface-2 p-1">
              {(
                [
                  ['dark', t('themeDark')],
                  ['light', t('themeLight')]
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={theme === id}
                  onClick={() => setTheme(id)}
                  className={[
                    'min-h-11 rounded-lg px-3 text-sm',
                    theme === id ? 'bg-accent font-extrabold text-accent-ink' : 'font-medium text-ink-soft'
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              ref={drawerButtonRef}
              onPointerDown={() => void loadDrawer()}
              onFocus={() => void loadDrawer()}
              onClick={openDrawer}
              aria-haspopup="dialog"
              className="flex min-h-12 items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-[15px] font-bold text-ink"
            >
              <span aria-hidden="true">📜</span> {t('pairsButton')}
            </button>
          </div>
        </header>

        <ControlPanel
          relation={state.relation}
          ageStep={state.ageStep}
          contextStep={state.contextStep}
          userGender={state.userGender}
          partnerGender={state.partnerGender}
          isReversed={state.isReversed}
          setRelation={pg.setRelation}
          setAgeStep={pg.setAgeStep}
          setContextStep={pg.setContextStep}
          setUserGender={pg.setUserGender}
          setPartnerGender={pg.setPartnerGender}
          toggleReversed={pg.toggleReversed}
        />

        <SentencePanel result={result} contextLabel={contextLabel} fromTable={state.explicitPair !== null} />

        <CuTitWisdomCard wisdom={wisdom} explanation={explanation} relationName={relationName} />
      </div>

      {drawerMounted && (
        <Suspense fallback={null}>
          <HonorificExplorerDrawer isOpen={drawerOpen} onClose={closeDrawer} onSelectPair={pg.applyPair} theme={theme} returnFocusRef={drawerButtonRef} />
        </Suspense>
      )}
    </div>
  );
}
