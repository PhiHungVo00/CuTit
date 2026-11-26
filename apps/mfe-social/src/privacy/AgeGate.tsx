import { useState } from 'react';
import { EmptyState } from '@vietlearning/ui';
import type { SocialClient } from '../client/types';
import { errCode } from '../client/errors';
import { useT } from '../i18n';
import { ScreenFrame, card, input, linkBtn, Notice, primaryBtn } from '../ui';

const OLDEST = 1920;

/**
 * Cổng tuổi: hỏi NĂM SINH một lần (chọn năm, không ô ngày). Năm chỉ nằm trong `useState` của form này; form bị gỡ ngay khi
 * lưu xong nên không còn ở DOM/state/localStorage. Lỗi KHÔNG nhắc lại giá trị. Gateway chỉ giữ cờ đủ/chưa đủ.
 */
export function AgeGate({ client, onDone }: { client: SocialClient; onDone: (isAdult: boolean) => void }) {
  const t = useT();
  const [year, setYear] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const now = new Date().getUTCFullYear();
  const years: number[] = [];
  for (let y = now; y >= OLDEST; y--) years.push(y);

  const save = async () => {
    if (!year || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await client.rest.declareAge(Number(year));
      setYear('');
      onDone(r.isAdult);
    } catch (e) {
      setBusy(false);
      setErr(errCode(e) === 'age_locked' ? t('age.err.locked') : t('age.err.other'));
    }
  };

  return (
    <ScreenFrame title={t('age.title')} back="/ho-so">
      <EmptyState mood="ngu" title={t('age.intro')} size={72} />
      <form
        className={card}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label htmlFor="age-year" className="text-[15px] font-bold text-ink-soft">
          {t('age.label')}
        </label>
        <select id="age-year" className={input} value={year} onChange={(e) => setYear(e.target.value)} aria-describedby="age-note">
          <option value="">{t('age.choose')}</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <p id="age-note" className="m-0 text-sm text-ink-muted">
          {t('age.note')}
        </p>
        {err && <Notice tone="error">{err}</Notice>}
        <button type="submit" className={primaryBtn} disabled={!year || busy}>
          {busy ? t('age.saving') : t('age.save')}
        </button>
      </form>
    </ScreenFrame>
  );
}

/** Màn 6b: dưới 18 — thân thiện, nói rõ cái gì khóa, vẫn học bình thường. */
export function MinorNotice() {
  const t = useT();
  return (
    <ScreenFrame title={t('list.title')} back="/ho-so">
      <EmptyState
        mood="suy-nghi"
        title={t('age.minorTitle')}
        body={t('age.minorBody')}
        action={
          <a href="/" className={linkBtn + ' justify-center bg-accent text-accent-ink'}>
            {t('backToLearn')}
          </a>
        }
      />
      <p className="m-0 text-center text-sm text-ink-soft">{t('age.minorMore')}</p>
    </ScreenFrame>
  );
}
