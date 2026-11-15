/**
 * App Capacitor: font là tệp cài sẵn trong gói (tải vài ms) nên dùng font-display: swap để chắc chắn hiện
 * Be Vietnam Pro. Với `optional` (styles/fonts.css, dành cho web), font lỡ lần vẽ đầu sẽ KHÔNG được dùng
 * cho tới hết phiên — đo trên emulator: h1 vẽ bằng Roboto dù font đã tải xong.
 * Quy tắc @font-face khai báo sau thắng => chèn bản `swap` cùng tên/độ đậm/unicode-range.
 */
const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const VIETNAMESE = 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB';

const FACES = [
  { weight: 400, range: LATIN, url: new URL('../../node_modules/@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-400-normal.woff2', import.meta.url).href },
  { weight: 400, range: VIETNAMESE, url: new URL('../../node_modules/@fontsource/be-vietnam-pro/files/be-vietnam-pro-vietnamese-400-normal.woff2', import.meta.url).href },
  { weight: 800, range: LATIN, url: new URL('../../node_modules/@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-800-normal.woff2', import.meta.url).href },
  { weight: 800, range: VIETNAMESE, url: new URL('../../node_modules/@fontsource/be-vietnam-pro/files/be-vietnam-pro-vietnamese-800-normal.woff2', import.meta.url).href }
];

export function applySwapFontsForNativeApp(): void {
  const style = document.createElement('style');
  style.textContent = FACES.map(
    (f) => `@font-face{font-family:'Be Vietnam Pro';font-style:normal;font-display:swap;font-weight:${f.weight};src:url(${f.url}) format('woff2');unicode-range:${f.range}}`
  ).join('');
  document.head.appendChild(style);
}
