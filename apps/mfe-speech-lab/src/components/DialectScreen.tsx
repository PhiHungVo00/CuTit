import { useMemo, useState } from 'react';
import { DIALECT_DICTIONARY, foldVietnamese, type Dialect, type DialectEntry } from '@vietlearning/content';
import { getDeviceSpeech } from '@vietlearning/native';
import { speechRate, useLearner } from '@vietlearning/state';
import { meaningFor, useT } from '../i18n';

const REGIONS: Dialect[] = ['north', 'central', 'south'];

/**
 * Màn hình M6: đối chiếu từ vựng Bắc / Trung / Nam (A7), nghe từng từ, lưu vào thẻ ôn tập (A4).
 * Lưu ý trung thực: giọng đọc của máy là MỘT giọng chung; giọng theo từng miền cần TTS phía máy chủ.
 */
export function DialectScreen() {
  const t = useT();
  const lang = useLearner((s) => s.preferences.uiLanguage);
  const myDialect = useLearner((s) => s.preferences.dialect);
  const srs = useLearner((s) => s.srs);
  const addCard = useLearner((s) => s.addCard);
  const [query, setQuery] = useState('');
  const [onlyDifferent, setOnlyDifferent] = useState(false);
  const [speaking, setSpeaking] = useState<string | null>(null);

  const entries = useMemo(() => {
    const q = foldVietnamese(query.trim());
    return DIALECT_DICTIONARY.filter(
      (e) =>
        (!onlyDifferent || new Set([e.north, e.central, e.south]).size === 3) &&
        (!q || foldVietnamese(`${e.north} ${e.central} ${e.south} ${e.meaning}`).includes(q))
    );
  }, [query, onlyDifferent]);

  const speak = (key: string, word: string) => {
    setSpeaking(key);
    getDeviceSpeech()
      .speak(word, { rate: speechRate(0.85) })
      .catch(() => undefined)
      .finally(() => setSpeaking((k) => (k === key ? null : k)));
  };

  const save = (e: DialectEntry) =>
    addCard({
      itemRef: `dialect:${e.id}`,
      front: e[myDialect],
      back: `${t('region.north')}: ${e.north} · ${t('region.central')}: ${e.central} · ${t('region.south')}: ${e.south} — ${meaningFor(e.meaning, lang)}`,
      source: 'dialect'
    });

  return (
    <div className="min-h-dvh bg-canvas px-4 pb-8 pt-[calc(16px+env(safe-area-inset-top))] font-sans text-ink">
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">
        <header className="flex flex-col gap-2 border-b-2 border-line pb-4">
          <h1 className="m-0 text-[26px] font-black leading-tight tracking-tight text-heading">{t('dialectTitle')}</h1>
          <p className="m-0 text-[15px] text-ink-soft">
            {t('dialectIntro')}
          </p>
          <p className="m-0 text-xs text-ink-muted">
            {t('oneVoice')}
          </p>
        </header>

        <label className="relative block">
          <span className="sr-only">{t('search')}</span>
          <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            🔍
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="min-h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-base text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex min-h-11 items-center gap-3 text-[15px] text-ink-soft">
          <input type="checkbox" checked={onlyDifferent} onChange={(e) => setOnlyDifferent(e.target.checked)} className="size-5 accent-[var(--ct-accent)]" />
          {t('onlyDifferent')}
        </label>

        <p className="m-0 text-sm text-ink-muted" aria-live="polite">
          {t('count', { n: entries.length })}
        </p>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {entries.map((e) => {
            const saved = Boolean(srs[`dialect:${e.id}`]);
            return (
              <li key={e.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[15px] font-bold text-ink">{meaningFor(e.meaning, lang)}</span>
                  {!e.reviewed && <span className="shrink-0 text-xs italic text-ink-muted">{t('unreviewed')}</span>}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {REGIONS.map((r) => {
                    const key = `${e.id}:${r}`;
                    const mine = r === myDialect;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => speak(key, e[r])}
                        aria-label={t('listenTo', { word: e[r], region: t(`region.${r}`) })}
                        className={[
                          'flex min-h-16 flex-col items-center justify-center rounded-xl border px-1 leading-tight',
                          mine ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2',
                          speaking === key ? 'ring-2 ring-accent' : ''
                        ].join(' ')}
                      >
                        <span className="text-xs font-bold text-ink-muted">{t(`region.${r}`)}</span>
                        <span lang="vi" className={['text-lg', mine ? 'font-black text-heading' : 'font-bold text-ink'].join(' ')}>
                          {e[r]}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => save(e)}
                  disabled={saved}
                  className="min-h-11 self-start rounded-xl border border-line bg-surface-2 px-3 text-sm font-bold text-ink disabled:opacity-60"
                >
                  {saved ? t('saved') : t('save')}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
