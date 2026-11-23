import { ListRow, Toggle } from '@vietlearning/ui';
import { setDeviceSettings, useDeviceSettings } from '@vietlearning/state';
import { useT } from '../i18n';
import { Rows } from '../parts';

export function ChuyenDong() {
  const t = useT();
  const on = useDeviceSettings((s) => s.reducedMotion);
  return (
    <>
      <Rows>
        <ListRow icon="chuyen-dong" label={t('reducedMotion')} hint={t('reducedMotionHint')} trailing={<Toggle label={t('reducedMotion')} checked={on} onChange={(reducedMotion) => setDeviceSettings({ reducedMotion })} />} />
      </Rows>
      <p className="m-0 text-sm text-ink-muted">{t('deviceOnly')}</p>
    </>
  );
}
