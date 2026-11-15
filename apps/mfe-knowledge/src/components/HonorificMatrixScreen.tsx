import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { CuTitWisdomCard } from './CuTitWisdomCard';

// Drawer (kèm Radix Dialog ~13KB gzip) chỉ tải khi người dùng cần: tải trước lúc chạm nút, mở khi nhả tay
const loadDrawer = () => import('./HonorificExplorerDrawer');
const HonorificExplorerDrawer = lazy(() => loadDrawer().then((m) => ({ default: m.HonorificExplorerDrawer })));
import { ControlPanel } from './honorific/ControlPanel';
import { SentencePanel } from './honorific/SentencePanel';
import { useHonorificPlayground } from './honorific/useHonorificPlayground';
import { AGE_STEPS, CONTEXT_STEPS, RELATIONS, type Theme } from './honorific/options';

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
  const [themeState, setThemeState] = useState<Theme>(initialTheme);
  const theme = themeProp ?? themeState;
  const setTheme = (t: Theme) => {
    if (themeProp === undefined) setThemeState(t);
    onThemeChange?.(t);
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

  const relationName = RELATIONS.find((r) => r.id === state.relation)?.label ?? state.relation;
  const contextLabel = `${CONTEXT_STEPS[state.contextStep].title} • ${AGE_STEPS[state.ageStep].title}`;

  return (
    <div data-theme={theme} className="min-h-dvh bg-canvas px-4 pb-8 pt-[calc(16px+env(safe-area-inset-top))] font-sans text-ink">
      <div className="mx-auto flex max-w-[560px] flex-col gap-5">
        <header className="flex flex-col gap-3 border-b-2 border-line pb-4">
          <h1 className="m-0 text-[26px] font-black leading-tight tracking-tight text-heading">Ma trận đại từ xưng hô</h1>
          <p className="m-0 text-[15px] text-ink-soft">Chọn quan hệ, tuổi và bối cảnh để xem cách xưng hô đúng mực.</p>

          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Giao diện" className="inline-flex rounded-xl border border-line bg-surface-2 p-1">
              {(
                [
                  ['dark', '🏮 Gỗ mộc'],
                  ['light', '🎋 Tre trúc']
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
              <span aria-hidden="true">📜</span> Bảng 20 cặp chuẩn
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

        <CuTitWisdomCard wisdom={result.wisdomTip} explanation={result.explanation} relationName={relationName} />
      </div>

      {drawerMounted && (
        <Suspense fallback={null}>
          <HonorificExplorerDrawer isOpen={drawerOpen} onClose={closeDrawer} onSelectPair={pg.applyPair} theme={theme} returnFocusRef={drawerButtonRef} />
        </Suspense>
      )}
    </div>
  );
}
