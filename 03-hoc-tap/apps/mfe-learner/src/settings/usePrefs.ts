import { useEffect, useRef, useState } from 'react';
import { learnerStore, type Preferences } from '@vietlearning/state';

export type Sync = 'idle' | 'saving' | 'synced' | 'local';

/** Đồng bộ lên Gateway (best-effort): luôn lưu trên máy trước, mạng lỗi thì giữ bản trên máy. */
async function pushPreferences(p: Preferences): Promise<boolean> {
  const [{ request }, { PreferencesSchema }] = await Promise.all([import('@vietlearning/api-client'), import('@vietlearning/contracts/api')]);
  try {
    await request('/v1/preferences', { method: 'PUT', body: p, schema: PreferencesSchema });
    return true;
  } catch {
    return false;
  }
}

/** Ghi tùy chỉnh học (đồng bộ được) vào learnerStore rồi đẩy lên Gateway sau 600 ms (gộp thay đổi liên tiếp). */
export function usePrefsUpdate() {
  const [sync, setSync] = useState<Sync>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  const update = (patch: Partial<Preferences>, alsoProfileDialect = false) => {
    const s = learnerStore.getState();
    s.setPreferences(patch);
    if (alsoProfileDialect && patch.dialect) learnerStore.setState({ profile: { ...learnerStore.getState().profile, dialect: patch.dialect } });
    setSync('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const ok = await pushPreferences(learnerStore.getState().preferences);
      if (mounted.current) setSync(ok ? 'synced' : 'local');
    }, 600);
  };

  return { sync, update };
}
