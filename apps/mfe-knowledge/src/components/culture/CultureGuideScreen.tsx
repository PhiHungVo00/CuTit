import { useMemo, useRef, useState, type FormEvent } from 'react';
import { CULTURE_CARDS, foldVietnamese, searchCulture, type CultureCard } from '@vietlearning/content';
import { learnerStore, useLearner, type UiLanguage } from '@vietlearning/state';
import { t as tK, useT } from '../../i18n';

const ALL = '*';
/** Nhóm thẻ: khóa là tên nhóm tiếng Việt (dữ liệu), nhãn hiển thị theo ngôn ngữ giao diện */
const CATEGORIES = Array.from(new Map(CULTURE_CARDS.map((c) => [c.category, c.categoryEn])).entries());
const cardText = (c: CultureCard, lang: UiLanguage) =>
  lang === 'en' ? { title: c.titleEn, content: c.contentEn, category: c.categoryEn } : { title: c.title, content: c.content, category: c.category };

type AskState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; answer: string; sources: string[]; offline: boolean; mock: boolean }
  | { status: 'error'; message: string };

/** Hỏi qua Gateway; mất mạng thì trả lời offline từ thẻ có sẵn (cùng hàm truy hồi với Gateway). */
async function ask(question: string, lang: UiLanguage): Promise<AskState> {
  const [{ request, GatewayRequestError, describeGatewayError }, { CultureAskResponseSchema }] = await Promise.all([
    import('@vietlearning/api-client'),
    import('@vietlearning/contracts/api')
  ]);
  try {
    const r = await request('/v1/culture/ask', { body: { question, language: lang }, schema: CultureAskResponseSchema });
    return { status: 'done', answer: r.answer, sources: r.sources, offline: false, mock: r.mock };
  } catch (err) {
    if (err instanceof GatewayRequestError && (err.kind === 'offline' || err.kind === 'timeout')) {
      const cards = searchCulture(question, 2);
      return {
        status: 'done',
        answer: cards.length
          ? cards
              .map((c) => cardText(c, lang))
              .map((c) => `${c.title}: ${c.content}`)
              .join('\n\n')
          : tK('noOfflineMatch'),
        sources: cards.map((c) => c.id),
        offline: true,
        mock: false
      };
    }
    return { status: 'error', message: describeGatewayError(err, lang) };
  }
}

/** Màn hình M10: Cẩm nang văn hóa (20 thẻ phong tục, kiêng kỵ) + hỏi đáp dựa trên thẻ. */
export function CultureGuideScreen() {
  const t = useT();
  const lang = useLearner((s) => s.preferences.uiLanguage);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL);
  const [question, setQuestion] = useState('');
  const [askState, setAskState] = useState<AskState>({ status: 'idle' });
  const [highlight, setHighlight] = useState<string | null>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());

  const cards = useMemo(() => {
    const q = foldVietnamese(query.trim());
    return CULTURE_CARDS.filter(
      (c) =>
        (category === ALL || c.category === category) &&
        (!q || foldVietnamese(`${c.title} ${c.content} ${c.category} ${c.titleEn} ${c.contentEn} ${c.categoryEn}`).includes(q))
    );
  }, [query, category]);

  const onAsk = async (e: FormEvent) => {
    e.preventDefault();
    if (question.trim().length < 3) return;
    setAskState({ status: 'loading' });
    setAskState(await ask(question.trim(), learnerStore.getState().preferences.uiLanguage));
  };

  const jumpTo = (id: string) => {
    setQuery('');
    setCategory(ALL);
    setHighlight(id);
    requestAnimationFrame(() => cardRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const titleOf = (id: string) => {
    const c = CULTURE_CARDS.find((x) => x.id === id);
    return c ? cardText(c, lang).title : id;
  };

  return (
    <div className="min-h-dvh bg-canvas px-4 pb-8 pt-[calc(16px+env(safe-area-inset-top))] font-sans text-ink">
      <div className="mx-auto flex max-w-[560px] flex-col gap-5">
        <header className="flex flex-col gap-2 border-b-2 border-line pb-4">
          <h1 className="m-0 text-[26px] font-black leading-tight tracking-tight text-heading">{t('cultureTitle')}</h1>
          <p className="m-0 text-[15px] text-ink-soft">{t('cultureIntro')}</p>
        </header>

        <section aria-labelledby="ct-ask" className="flex flex-col gap-3 rounded-2xl border border-line-strong bg-surface p-4 shadow-card">
          <h2 id="ct-ask" className="m-0 flex items-center gap-2 text-lg font-extrabold">
            <span aria-hidden="true">🏮</span> {t('askTitle')}
          </h2>
          <form onSubmit={onAsk} className="flex flex-col gap-2">
            <label htmlFor="ct-question" className="sr-only">
              {t('askLabel')}
            </label>
            <textarea
              id="ct-question"
              rows={2}
              maxLength={300}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t('askPlaceholder')}
              className="w-full resize-none rounded-xl border border-line bg-sunken p-3 text-base text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={askState.status === 'loading' || question.trim().length < 3}
              className="min-h-12 rounded-xl bg-accent px-4 text-base font-extrabold text-accent-ink disabled:opacity-50"
            >
              {askState.status === 'loading' ? t('searching') : t('ask')}
            </button>
          </form>
          {askState.status === 'done' && (
            <div role="status" className="flex flex-col gap-2 rounded-xl bg-sunken p-3">
              {askState.offline && <span className="text-xs font-bold text-ink-muted">{t('offlineAnswer')}</span>}
              {askState.mock && <span className="text-xs font-bold text-ink-muted">{t('sampleAnswer')}</span>}
              <p className="m-0 whitespace-pre-line text-[15px] leading-relaxed text-ink">{askState.answer}</p>
              {askState.sources.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                  {t('sources')}
                  {askState.sources.map((id) => (
                    <button key={id} type="button" onClick={() => jumpTo(id)} className="min-h-11 rounded-full bg-accent-soft px-3 font-bold text-heading">
                      {titleOf(id)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {askState.status === 'error' && (
            <p role="alert" className="m-0 rounded-xl bg-danger-soft p-3 text-sm text-danger-ink">
              {askState.message}
            </p>
          )}
        </section>

        <section aria-labelledby="ct-cards" className="flex flex-col gap-3">
          <h2 id="ct-cards" className="sr-only">
            {t('cardList')}
          </h2>
          <label className="relative block">
            <span className="sr-only">{t('searchCards')}</span>
            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
              🔍
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchCardsPlaceholder')}
              className="min-h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-base text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
            />
          </label>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label={t('filter')}>
            {[[ALL, t('all'), t('all')] as const, ...CATEGORIES.map(([vi, en]) => [vi, vi, en] as const)].map(([id, vi, en]) => (
              <button
                key={id}
                type="button"
                aria-pressed={category === id}
                onClick={() => setCategory(id)}
                className={[
                  'min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-sm',
                  category === id ? 'bg-accent font-bold text-accent-ink' : 'bg-surface-2 font-medium text-ink-soft'
                ].join(' ')}
              >
                {lang === 'en' ? en : vi}
              </button>
            ))}
          </div>

          <p className="m-0 text-sm text-ink-muted" aria-live="polite">
            {t('cardCount', { n: cards.length })}
          </p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {cards.map((c: CultureCard) => (
              <li
                key={c.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(c.id, el);
                  else cardRefs.current.delete(c.id);
                }}
                className={[
                  'flex flex-col gap-2 rounded-2xl border bg-surface p-4',
                  highlight === c.id ? 'border-accent ring-2 ring-accent' : 'border-line'
                ].join(' ')}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="m-0 text-base font-extrabold text-ink">{cardText(c, lang).title}</h3>
                  <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-bold text-heading">{cardText(c, lang).category}</span>
                </div>
                <p lang={lang} className="m-0 text-[15px] leading-relaxed text-ink-soft">
                  {cardText(c, lang).content}
                </p>
                {!c.reviewed && <span className="text-xs italic text-ink-muted">{t('draft')}</span>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
