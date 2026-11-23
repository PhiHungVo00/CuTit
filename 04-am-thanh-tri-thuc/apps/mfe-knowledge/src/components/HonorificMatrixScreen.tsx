import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { HONORIFIC_PAIRS_20 } from '@vietlearning/content';
import { useLearner } from '@vietlearning/state';
import { Button } from '@vietlearning/ui';
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
  /** Chỉ dùng cho khung giả lập dev: bình thường giao diện do Cài đặt quyết định (data-theme trên <html>). */
  theme?: Theme;
  /** @deprecated Công tắc sáng/tối đã gỡ khỏi màn này; giữ prop để host cũ vẫn biên dịch. */
  onThemeChange?: (theme: Theme) => void;
  onPairChange?: (pair: { speaker: string; listener: string; pairId: string }) => void;
}

/**
 * Màn hình M3: Ma trận đại từ xưng hô (Thuật toán A6).
 * Logic nằm trong useHonorificPlayground; màu lấy từ design tokens qua data-theme,
 * nên đổi giao diện không remount và giữ nguyên lựa chọn của người học.
 */
export function HonorificMatrixScreen({ theme, onPairChange }: HonorificMatrixScreenProps) {
  const t = useT();
  const en = useLearner((s) => s.preferences.uiLanguage) === 'en';
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(false);
  const drawerButtonRef = useRef<HTMLButtonElement | null>(null);
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
            <Button
              type="button"
              variant="secondary"
              onPointerDown={() => void loadDrawer()}
              onFocus={() => void loadDrawer()}
              onClick={(e) => {
                drawerButtonRef.current = e.currentTarget;
                openDrawer();
              }}
              aria-haspopup="dialog"
            >
              {t('pairsButton')}
            </Button>
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
