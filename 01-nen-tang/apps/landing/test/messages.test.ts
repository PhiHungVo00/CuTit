import { describe, expect, it } from 'vitest';
import { messages } from '../src/messages';

/** Liệt kê đường dẫn của mọi chuỗi lá (mảng: theo chỉ số) */
function keys(obj: unknown, prefix = ''): string[] {
  if (typeof obj === 'string') return [prefix];
  if (Array.isArray(obj)) return obj.flatMap((v, i) => keys(v, `${prefix}[${i}]`));
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe('messages', () => {
  it('mỗi khóa ở vi đều có ở en và ngược lại', () => {
    expect(keys(messages.en).sort()).toEqual(keys(messages.vi).sort());
  });
  it('không có chuỗi rỗng', () => {
    for (const lang of ['vi', 'en'] as const) {
      for (const k of keys(messages[lang])) {
        const v = k.split(/[.[\]]+/).filter(Boolean).reduce<any>((o, p) => o[p], messages[lang]);
        expect(v.trim(), `${lang}:${k}`).not.toBe('');
      }
    }
  });
  it('tiêu đề đúng chữ đã duyệt', () => {
    expect(messages.vi.hero.title).toBe('Học tiếng Việt như người Việt nói, cùng Bé Cu Tít');
    expect(messages.en.hero.title).toBe("Learn Vietnamese the way it's really spoken, with Cu Tít");
  });
});
