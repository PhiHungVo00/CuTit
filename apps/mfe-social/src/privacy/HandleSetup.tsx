import { useState } from 'react';
import type { SocialClient } from '../client/types';
import { errCode } from '../client/errors';
import { useT } from '../i18n';
import { ScreenFrame, card, input, Notice, primaryBtn } from '../ui';

/** Luật handle (bản rút gọn của HandleSchema ở contracts; Gateway kiểm lại): 3–24, a-z 0-9 . _, không đầu/cuối '.', không '..' */
export const normalizeHandle = (s: string) => s.trim().replace(/^@/, '').toLowerCase();
export const isValidHandle = (h: string) => /^[a-z0-9._]{3,24}$/.test(h) && !h.startsWith('.') && !h.endsWith('.') && !h.includes('..');

export function HandleSetup({ client, suggested, onDone }: { client: SocialClient; suggested: string | null; onDone: () => void }) {
  const t = useT();
  const [value, setValue] = useState(suggested ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    const h = normalizeHandle(value);
    if (!isValidHandle(h)) return setErr(t('handle.err.bad'));
    setBusy(true);
    setErr(null);
    try {
      await client.rest.setHandle(h);
      onDone();
    } catch (e) {
      setBusy(false);
      const c = errCode(e);
      setErr(c === 'handle_taken' ? t('handle.err.handle_taken') : c === 'handle_cooldown' ? t('handle.err.handle_cooldown') : t('handle.err.other'));
    }
  };

  return (
    <ScreenFrame title={t('handle.title')} back="/ho-so">
      <p className="m-0 text-[15px] text-ink-soft">{t('handle.intro')}</p>
      <form
        className={card}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label htmlFor="handle" className="text-[15px] font-bold text-ink-soft">
          {t('handle.label')}
        </label>
        <input id="handle" className={input} value={value} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby="handle-hint" onChange={(e) => setValue(e.target.value)} />
        <p id="handle-hint" className="m-0 text-sm text-ink-muted">
          {t('handle.hint')}
        </p>
        {err && <Notice tone="error">{err}</Notice>}
        <button type="submit" className={primaryBtn} disabled={busy || !value.trim()}>
          {t('handle.save')}
        </button>
      </form>
    </ScreenFrame>
  );
}
