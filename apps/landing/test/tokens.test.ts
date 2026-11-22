import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: tệp .mjs không có kiểu
import { extractTokens, SOURCE, TARGET } from '../scripts/trich-token.mjs';

describe('tokens.css', () => {
  it('khớp với chủ đề sáng của packages/ui (chưa lệch nguồn)', () => {
    expect(readFileSync(TARGET, 'utf8')).toBe(extractTokens(readFileSync(SOURCE, 'utf8')));
  });
  it('có màu chính của chủ đề sáng, không có màu chủ đề tối', () => {
    const css = readFileSync(TARGET, 'utf8');
    expect(css).toContain('--ct-canvas: #fbf3e4');
    expect(css).not.toContain('#1f1710');
  });
});
