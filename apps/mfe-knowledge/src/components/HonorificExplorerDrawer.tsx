import { memo, useEffect, useMemo, useState, type RefObject } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { HONORIFIC_PAIRS_20, type HonorificPairItem } from '@vietlearning/content';
import { useLearner } from '@vietlearning/state';
import { speechService } from '../services/speechSynthesis';
import { useT } from '../i18n';

export interface HonorificExplorerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPair: (pair: HonorificPairItem) => void;
  /** Giao diện của màn hình cha; drawer render qua Portal nên phải gắn lại data-theme */
  theme: 'dark' | 'light';
  /** Phần tử nhận lại focus khi đóng bảng (drawer mở bằng state, không qua Dialog.Trigger) */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

const CATEGORIES = ['all', 'traditional', 'kin', 'social', 'teacher_student', 'civic'] as const;

/** Bỏ dấu để tìm "bac" ra "bác", "thay" ra "thầy". */
const fold = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

/** Chỉ mục tìm kiếm tính một lần khi nạp module, không tính lại theo từng phím gõ. */
const SEARCH_INDEX = HONORIFIC_PAIRS_20.map((p) => ({
  pair: p,
  haystack: fold([p.relationName, p.relationNameEn, p.speaker, p.listener, p.example, p.explanation, p.explanationEn, p.politeParticle].join(' | '))
}));

/**
 * Bảng 20 cặp xưng hô chuẩn (Radix Dialog):
 * có sẵn focus trap, đóng bằng Esc, khóa cuộn nền, role="dialog" + aria; nút Back Android đóng bảng.
 */
export const HonorificExplorerDrawer = memo(function HonorificExplorerDrawer({
  isOpen,
  onClose,
  onSelectPair,
  theme,
  returnFocusRef
}: HonorificExplorerDrawerProps) {
  const [query, setQuery] = useState('');
  const t = useT();
  const en = useLearner((s) => s.preferences.uiLanguage) === 'en';
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('all');
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Nút Back cứng của Android (Shell phát sự kiện 'app:back'): đóng bảng thay vì rời màn hình
  useEffect(() => {
    if (!isOpen) return;
    const onBack = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    window.addEventListener('app:back', onBack);
    return () => window.removeEventListener('app:back', onBack);
  }, [isOpen, onClose]);

  // Đóng bảng thì dừng đọc mẫu
  useEffect(() => {
    if (!isOpen && playingId) {
      speechService.stop();
      setPlayingId(null);
    }
  }, [isOpen, playingId]);

  const pairs = useMemo(() => {
    const q = fold(query.trim());
    return SEARCH_INDEX.filter(
      ({ pair, haystack }) =>
        (category === 'all' || pair.category === category || pair.relation === category) && (!q || haystack.includes(q))
    ).map((x) => x.pair);
  }, [query, category]);

  const play = (item: HonorificPairItem) => {
    if (playingId === item.id) {
      speechService.stop();
      setPlayingId(null);
      return;
    }
    setPlayingId(item.id);
    speechService.speak(item.example, {
      onEnd: () => setPlayingId((id) => (id === item.id ? null : id)),
      onError: () => setPlayingId((id) => (id === item.id ? null : id))
    });
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <div data-theme={theme} className="font-sans">
          <Dialog.Overlay className="fixed inset-0 z-[1000] bg-black/70" />
          <Dialog.Content
            aria-describedby="ct-drawer-desc"
            onCloseAutoFocus={(e) => {
              if (!returnFocusRef?.current) return;
              e.preventDefault();
              returnFocusRef.current.focus();
            }}
            className="fixed inset-y-0 right-0 z-[1001] flex w-full max-w-[680px] flex-col bg-canvas text-ink shadow-2xl outline-none sm:border-l-2 sm:border-line-strong"
            style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <header className="flex items-start justify-between gap-3 border-b border-line bg-surface px-4 py-3">
              <div>
                <Dialog.Title className="m-0 flex items-center gap-2 text-lg font-extrabold text-ink">
                  <span aria-hidden="true">📜</span> {t('drawerTitle')}
                </Dialog.Title>
                <Dialog.Description id="ct-drawer-desc" className="m-0 text-sm text-ink-soft">
                  {t('drawerHint')}
                </Dialog.Description>
              </div>
              <Dialog.Close className="min-h-11 min-w-11 shrink-0 rounded-xl bg-surface-2 px-3 text-sm font-bold text-ink-soft">
                {t('close')}
              </Dialog.Close>
            </header>

            <div className="flex flex-col gap-3 border-b border-line bg-surface-2 px-4 py-3">
              <label className="relative block">
                <span className="sr-only">{t('searchPairs')}</span>
                <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                  🔍
                </span>
                <input
                  type="search"
                  inputMode="search"
                  enterKeyHint="search"
                  placeholder={t('searchPairsPlaceholder')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  // 16px: tránh iOS tự phóng to khi focus
                  className="min-h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-base text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
                />
              </label>
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label={t('filter')}>
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                    className={[
                      'min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-sm',
                      category === c ? 'bg-accent font-bold text-accent-ink' : 'bg-surface font-medium text-ink-soft'
                    ].join(' ')}
                  >
                    {c === 'all' ? t('all') : t(`drawer.${c}`)}
                  </button>
                ))}
              </div>
            </div>

            <ul className="m-0 flex flex-1 list-none flex-col gap-3 overflow-y-auto overscroll-contain p-4" aria-live="polite">
              {pairs.length === 0 && (
                <li className="py-8 text-center text-ink-soft">{t('noPairs', { q: query })}</li>
              )}
              {pairs.map((item) => {
                const playing = playingId === item.id;
                return (
                  <li key={item.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-base text-ink">{en && item.relationNameEn ? item.relationNameEn : item.relationName}</strong>
                      {!en && <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-bold text-heading">{item.ageRelationText}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-sunken p-2 text-[15px] font-bold">
                      <span className="rounded-md border border-chip1-line bg-chip1-bg px-2 py-0.5 text-ink">{t('selfTerm', { w: item.speaker })}</span>
                      <span aria-hidden="true" className="text-ink-muted">→</span>
                      <span className="rounded-md border border-chip2-line bg-chip2-bg px-2 py-0.5 text-ink">{t('callTerm', { w: item.listener })}</span>
                      <span className="rounded-md border border-chip3-line bg-chip3-bg px-2 py-0.5 text-ink">{item.politeParticle}</span>
                    </div>
                    <p lang="vi" className="m-0 text-[15px] italic leading-relaxed text-ink-soft">
                      “{item.example}”
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        aria-pressed={playing}
                        onClick={() => play(item)}
                        className="min-h-11 rounded-xl border border-line bg-surface-2 px-3 text-sm font-bold text-ink"
                      >
                        {playing ? t('playing') : t('playPair')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectPair(item);
                          onClose();
                        }}
                        className="min-h-11 rounded-xl bg-accent px-3 text-sm font-extrabold text-accent-ink"
                      >
                        {t('apply')}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
});
