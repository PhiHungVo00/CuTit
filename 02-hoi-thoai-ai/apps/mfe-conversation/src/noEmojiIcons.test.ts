import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });

describe('không dùng emoji làm icon điều hướng/nút (Task 12)', () => {
  it('mã nguồn màn hình không còn ký tự emoji (dùng Icon/CuTit của @vietlearning/ui)', () => {
    const bad = files(join(__dirname)).flatMap((p) =>
      readFileSync(p, 'utf8')
        .split('\n')
        .flatMap((line, i) => (/\p{Extended_Pictographic}/u.test(line) ? [`${p}:${i + 1}: ${line.trim()}`] : []))
    );
    expect(bad).toEqual([]);
  });
});
