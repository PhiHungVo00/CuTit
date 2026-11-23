/**
 * Trích token màu của CHỦ ĐỀ SÁNG từ packages/ui/src/theme.css ra src/styles/tokens.css.
 * Không import nguyên tệp theme.css vì nó mở đầu bằng khối Tailwind `@theme inline`.
 * Chạy: pnpm --filter @vietlearning/landing tokens   (test/tokens.test.ts kiểm tệp sinh ra còn khớp nguồn)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const SOURCE = resolve(here, '../../../packages/ui/src/theme.css');
export const TARGET = resolve(here, '../src/styles/tokens.css');

/** Lấy thân khối CSS bắt đầu bằng `selector {` (khớp ngoặc, không hỗ trợ lồng) */
function block(css, selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Không thấy khối ${selector} trong theme.css`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

export function extractTokens(css) {
  const light = block(css, "[data-theme='light']");
  const radius = block(css, ':root');
  const keep = (body) =>
    body
      .split('\n')
      .filter((l) => /--ct-[\w-]+:/.test(l) || /^\s*\/\*/.test(l) || /^\s*color-scheme/.test(l))
      .join('\n');
  return `/* SINH TỰ ĐỘNG bởi scripts/trich-token.mjs từ packages/ui/src/theme.css (chủ đề SÁNG). Không sửa tay: sửa nguồn rồi chạy \`pnpm --filter @vietlearning/landing tokens\`. */
:root {
${keep(radius)}
${keep(light)}
}
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(TARGET, extractTokens(readFileSync(SOURCE, 'utf8')));
  console.log(`Đã ghi ${TARGET}`);
}
