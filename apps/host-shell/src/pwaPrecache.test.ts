import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('PWA precache (P0-3)', () => {
  it('globPatterns có webp để ảnh Cu Tít chạy được ngoại tuyến', () => {
    const src = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
    const m = /globPatterns:\s*\['([^']+)'\]/.exec(src);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/\{[^}]*\bwebp\b[^}]*\}/);
  });
});
