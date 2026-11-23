/**
 * Dựng HTML các trang lúc build (Node, không vào gói trình duyệt): chèn chữ từ messages.ts vào khung trang.
 * Không có style nội tuyến và không có script nội tuyến (CSP của _headers cấm cả hai).
 */
import { formatMb, type ApkRelease } from './apk';
import { messages, type Lang } from './messages';

export type PageId = 'home' | 'apk';
export type RenderContext = { appOrigin: string; apk: ApkRelease | null; siteOrigin: string };

/** Đường dẫn từng trang theo ngôn ngữ (đúng với 4 tệp HTML đầu vào) */
export const PATHS: Record<PageId, Record<Lang, string>> = {
  home: { vi: '/', en: '/en/' },
  apk: { vi: '/tai-apk', en: '/en/tai-apk' }
};

/** Ánh xạ đường dẫn tệp HTML của Vite => trang + ngôn ngữ */
export const PAGE_BY_FILE: Record<string, { page: PageId; lang: Lang }> = {
  '/index.html': { page: 'home', lang: 'vi' },
  '/en/index.html': { page: 'home', lang: 'en' },
  '/tai-apk/index.html': { page: 'apk', lang: 'vi' },
  '/en/tai-apk/index.html': { page: 'apk', lang: 'en' }
};

export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const SHOTS = ['path', 'chat', 'culture'] as const;
const SHOT_FILE = { path: 'lo-trinh', chat: 'tro-chuyen', culture: 'xung-ho' } as const;
const REGIONS = ['bac', 'trung', 'nam'] as const;

/** Ảnh chụp app: khung Pixel 7, cạnh dài 1080 px => 486 x 1080 */
const SHOT_W = 486;
const SHOT_H = 1080;

function header(lang: Lang, page: PageId, ctx: RenderContext): string {
  const m = messages[lang];
  const other: Lang = lang === 'vi' ? 'en' : 'vi';
  const sw = (l: Lang, label: string) =>
    `<a class="lang__opt" data-lang-switch="${l}" href="${PATHS[page][l]}" hreflang="${l}" lang="${l}"${l === lang ? ' aria-current="true"' : ''}>${label}</a>`;
  void other;
  return `<a class="skip" href="#main">${esc(m.nav.skip)}</a>
<header class="top"><div class="wrap top__in">
  <a class="brand" href="${PATHS.home[lang]}" aria-label="${esc(m.nav.home)}"><img src="/icon-192.png" width="36" height="36" alt=""><span class="brand__name">${esc(m.brand)}</span></a>
  <div class="top__right">
    <nav class="lang" aria-label="${esc(m.nav.langLabel)}">${sw('vi', 'VI')}<span aria-hidden="true">|</span>${sw('en', 'EN')}</nav>
    <a class="pill" data-nav="login" href="${ctx.appOrigin}/ho-so">${esc(m.nav.login)}</a>
  </div>
</div></header>`;
}

/** Hai nút chính. Chưa có APK ký => nút "Sắp có" (button aria-disabled, không đi đâu cả) */
function ctas(lang: Lang, ctx: RenderContext, classes = ''): string {
  const m = messages[lang];
  const apk = ctx.apk
    ? `<a class="btn btn--ghost" data-cta="apk" href="${PATHS.apk[lang]}">${esc(m.cta.apk)}</a>`
    : `<button class="btn btn--ghost" type="button" data-cta="apk" aria-disabled="true">${esc(m.cta.apkSoon)}</button>`;
  return `<div class="ctas ${classes}"><a class="btn btn--main" data-cta="web" href="${ctx.appOrigin}/">${esc(m.cta.web)}</a>${apk}</div>`;
}

function footer(lang: Lang, ctx: RenderContext): string {
  const m = messages[lang];
  return `<footer class="foot"><div class="wrap foot__in">
  <a href="${ctx.appOrigin}/quyen-rieng-tu">${esc(m.footer.privacy)}</a>
  <a href="${ctx.appOrigin}/xoa-tai-khoan">${esc(m.footer.deleteAccount)}</a>
  <a href="${PATHS.apk[lang]}">${esc(m.footer.apkGuide)}</a>
  <a href="${ctx.appOrigin}/gop-y">${esc(m.footer.feedback)}</a>
  <span>&copy; ${new Date().getFullYear()} ${esc(m.footer.copy)}</span>
</div></footer>`;
}

function home(lang: Lang, ctx: RenderContext): string {
  const m = messages[lang];
  const shots = SHOTS.map(
    (k) => `<li class="feat__card">
      <img class="shot" src="/img/anh-chup/${lang}/${SHOT_FILE[k]}.webp" width="${SHOT_W}" height="${SHOT_H}" loading="lazy" decoding="async" alt="${esc(m.feat[k].alt)}">
      <h3>${esc(m.feat[k].title)}</h3><p>${esc(m.feat[k].body)}</p></li>`
  ).join('\n');
  const play = REGIONS.map(
    (r) => `<button class="play" type="button" data-play="${r}" data-error="${esc(m.ba.error)}"><span aria-hidden="true">▶</span> ${esc(m.ba[r])}</button>`
  ).join('\n');
  const faq = m.faq.items.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n');
  return `${header(lang, 'home', ctx)}
<div class="suggest" data-suggest-en hidden><div class="wrap suggest__in"><span>${esc(messages.en.suggest.text)}</span> <a href="${PATHS.home.en}" hreflang="en" lang="en">${esc(messages.en.suggest.link)}</a>
  <button class="suggest__close" type="button" data-suggest-close aria-label="${esc(messages.en.suggest.close)}">×</button></div></div>
<main id="main">
<section class="hero">
  <img class="hero__art" src="/img/hero-fallback.svg" width="1200" height="600" alt="${esc(m.hero.art)}" fetchpriority="high">
  <div class="wrap hero__in">
    <div class="hero__panel">
      <h1>${esc(m.hero.title)}</h1>
      <p>${esc(m.hero.sub)}</p>
      ${ctas(lang, ctx)}
      <button class="music" type="button" data-music aria-pressed="false" data-on-label="${esc(m.hero.musicOn)}" data-off-label="${esc(m.hero.music)}" data-error="${esc(m.ba.error)}">${esc(m.hero.music)}</button>
    </div>
    <img class="hero__cutit" src="/img/cutit-chao.webp" width="320" height="320" alt="" decoding="async">
  </div>
</section>
<section class="wrap section" aria-labelledby="ba-title">
  <div class="ba">
    <h2 id="ba-title" class="ba__title">${esc(m.ba.title)}</h2>
    <p class="ba__q" lang="vi">“${esc(m.ba.sentence)}”</p>
    <div class="ba__play" role="group" aria-label="${esc(m.ba.hint)}">${play}</div>
    <p class="ba__status" role="status" data-play-status></p>
    <p class="ba__xh">${esc(m.ba.honorific)} <span lang="vi">${esc(m.ba.toGrandpa)}</span> · <span lang="vi">${esc(m.ba.toSister)}</span> · <span lang="vi">${esc(m.ba.toYounger)}</span></p>
  </div>
</section>
<section class="wrap section" aria-labelledby="feat-title">
  <h2 id="feat-title">${esc(m.feat.heading)}</h2>
  <ul class="feat">${shots}</ul>
</section>
<section class="wrap section" aria-labelledby="faq-title">
  <h2 id="faq-title">${esc(m.faq.heading)}</h2>
  ${faq}
</section>
<section class="wrap section">
  <div class="end"><h2>${esc(m.end.title)}</h2>${ctas(lang, ctx, 'ctas--center')}</div>
</section>
</main>
${footer(lang, ctx)}`;
}

function apkPage(lang: Lang, ctx: RenderContext): string {
  const m = messages[lang];
  const a = ctx.apk;
  const dl = a
    ? `<a class="btn btn--main" data-apk="download" href="${esc(a.url)}" download>${esc(m.apk.download)}</a>`
    : `<button class="btn btn--main" type="button" data-apk="download" aria-disabled="true">${esc(m.apk.download)} (${esc(m.apk.soon)})</button>`;
  const facts = a
    ? `<dl class="facts">
      <div><dt>${esc(m.apk.version)}</dt><dd>${esc(a.version)}</dd></div>
      <div><dt>${esc(m.apk.size)}</dt><dd>${esc(formatMb(a.bytes))}</dd></div>
      <div><dt>${esc(m.apk.minAndroid)}</dt><dd>${esc(a.minAndroid)}+</dd></div>
      <div><dt>${esc(m.apk.sha)}</dt><dd class="sha"><code>${esc(a.sha256)}</code></dd></div>
    </dl>`
    : `<p class="note">${esc(m.apk.soonNote)}</p>`;
  const steps = m.apk.steps.map((s) => `<li>${esc(s)}</li>`).join('\n');
  return `${header(lang, 'apk', ctx)}
<main id="main" class="wrap section apk">
  <h1>${esc(m.apk.title)}</h1>
  <p>${esc(m.apk.intro)}</p>
  <div class="apk__not-android" data-apk="not-android" hidden><p>${esc(m.apk.notAndroid)}</p><a class="btn btn--main" href="${ctx.appOrigin}/">${esc(m.apk.notAndroidCta)}</a></div>
  ${facts}
  <p>${dl}</p>
  <h2>${esc(m.apk.stepsTitle)}</h2>
  <ol class="steps">${steps}</ol>
  <p><a href="${PATHS.home[lang]}">${esc(m.apk.back)}</a></p>
</main>
${footer(lang, ctx)}`;
}

export function renderBody(page: PageId, lang: Lang, ctx: RenderContext): string {
  return page === 'home' ? home(lang, ctx) : apkPage(lang, ctx);
}

/** Thẻ <head>: tiêu đề, mô tả, hreflang, Open Graph, Twitter card, biểu tượng */
export function renderHead(page: PageId, lang: Lang, ctx: RenderContext): string {
  const m = messages[lang];
  const title = page === 'home' ? m.meta.title : m.meta.apkTitle;
  const desc = page === 'home' ? m.meta.description : m.meta.apkDescription;
  const abs = (p: string) => `${ctx.siteOrigin}${p}`;
  const self = abs(PATHS[page][lang]);
  const og = abs('/og.png');
  // Chưa đặt LANDING_SITE_ORIGIN: bỏ canonical/hreflang/og:url (cần địa chỉ tuyệt đối; Vite cũng không cho link tương đối trỏ thư mục)
  const hasSite = ctx.siteOrigin !== '';
  const siteTags = hasSite
    ? [
        `<link rel="canonical" href="${self}">`,
        `<link rel="alternate" hreflang="vi" href="${abs(PATHS[page].vi)}">`,
        `<link rel="alternate" hreflang="en" href="${abs(PATHS[page].en)}">`,
        `<link rel="alternate" hreflang="x-default" href="${abs(PATHS[page].vi)}">`,
      ]
    : [];
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    ...siteTags,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(m.brand)}">`,
    `<meta property="og:locale" content="${lang === 'vi' ? 'vi_VN' : 'en_US'}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${self}">`,
    `<meta property="og:image" content="${og}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${esc(m.meta.ogAlt)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="twitter:image" content="${og}">`,
    `<link rel="icon" type="image/png" href="/icon-192.png">`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
    `<meta name="theme-color" content="#fbf3e4">`
  ].join('\n');
}
