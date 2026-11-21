import { SegmentedControl } from '@vietlearning/ui';
import { setDeviceSettings, useDeviceSettings, type ThemeChoice } from '@vietlearning/state';
import { card } from '../../common/ui';
import { useT } from '../i18n';

const THEMES: ThemeChoice[] = ['light', 'dark', 'system'];

export function GiaoDien() {
  const t = useT();
  const theme = useDeviceSettings((s) => s.theme);
  return (
    <section className={card}>
      <span className="text-[15px] font-bold text-ink-soft">{t('themeLegend')}</span>
      <SegmentedControl label={t('themeLegend')} value={theme} options={THEMES.map((v) => ({ value: v, label: t(`theme.${v}`) }))} onChange={(v) => setDeviceSettings({ theme: v })} />
      <p className="m-0 text-sm text-ink-muted">{t('deviceOnly')}</p>
    </section>
  );
}
