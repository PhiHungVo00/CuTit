import { describe, expect, it, vi } from 'vitest';

/**
 * Proxy giả giống plugin Capacitor: MỌI thuộc tính đều là “lời gọi native”, kể cả `then`
 * (Capacitor trả hàm cho mọi tên; `then` không bao giờ gọi callback => Promise bọc proxy treo mãi).
 */
const store = new Map<string, string>();
const fakePlugin = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === 'then') return () => undefined; // native “then() not implemented”: không resolve
      if (prop === 'get') return async ({ key }: { key: string }) => ({ value: store.get(key) ?? null });
      if (prop === 'set') return async ({ key, value }: { key: string; value: string }) => void store.set(key, value);
      if (prop === 'remove') return async ({ key }: { key: string }) => void store.delete(key);
      return undefined;
    }
  }
);
vi.mock('@capacitor/preferences', () => ({ Preferences: fakePlugin }));

const withTimeout = <T>(p: Promise<T>) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('treo: plugin proxy bị dò .then')), 500))]);

describe('preferencesStore (phiên đăng nhập trên app native)', () => {
  it('đọc/ghi/xóa không treo khi plugin là proxy trả lời mọi thuộc tính (kể cả then)', async () => {
    const { preferencesStore } = await import('./storage');
    await withTimeout(preferencesStore.set('k', 'v'));
    expect(await withTimeout(preferencesStore.get('k'))).toBe('v');
    await withTimeout(preferencesStore.remove('k'));
    expect(await withTimeout(preferencesStore.get('k'))).toBeNull();
  });
});
