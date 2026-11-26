import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { learnerStore } from '@vietlearning/state';
import { tMsg } from './i18n';

/** Đọc khối vi và khối en từ mã nguồn để so khóa (defineMessages không lộ từ điển). */
const src = readFileSync('src/i18n.ts', 'utf8');
const [viBlock, enBlock] = src.split(/\n  \},\n  \{\n/);
const keys = (b: string) => [...b.matchAll(/^\s+'?([\w.]+)'?: /gm)].map((m) => m[1]!).filter((k) => k !== 'import');

describe('Chuỗi vi + en', () => {
  it('mọi khóa có đủ vi và en, không trùng khóa, không rỗng', () => {
    const vi = keys(viBlock!);
    const en = keys(enBlock!);
    expect(vi.length).toBeGreaterThan(100);
    expect(new Set(vi).size).toBe(vi.length);
    expect(en.sort()).toEqual([...vi].sort());
  });

  it('tiếng Anh khác tiếng Việt ở các chuỗi chính và có đủ biến {name}/{n}', () => {
    for (const lang of ['vi', 'en'] as const) {
      learnerStore.getState().setPreferences({ uiLanguage: lang });
      for (const k of ['list.title', 'chat.send', 'age.save', 'safety.report', 'find.submit'] as const) expect(tMsg(k).length).toBeGreaterThan(1);
      expect(tMsg('safety.blockConfirm', { name: 'Minh' })).toContain('Minh');
      expect(tMsg('list.unread', { n: 3 })).toContain('3');
    }
    learnerStore.getState().setPreferences({ uiLanguage: 'en' });
    expect(tMsg('chat.send')).toBe('Send');
    learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
    expect(tMsg('chat.send')).toBe('Gửi');
  });
});
