import { Icon, ListRow, Toggle } from '@vietlearning/ui';
import { setDeviceSettings, useDeviceSettings } from '@vietlearning/state';
import type { MusicChoice } from '@vietlearning/shared/audio';
import { ChoiceGroup, card } from '../../common/ui';
import { useT } from '../i18n';
import { Rows } from '../parts';

const TRACKS: MusicChoice[] = ['rotate', 'sang-lang', 'chieu-dong', 'trau-ve'];

/** Chỉ ghi deviceSettings; host-shell phản ứng (bật/tắt/đổi bài/âm lượng). KHÔNG gọi `music` ở đây. */
export function AmThanh() {
  const t = useT();
  const s = useDeviceSettings((d) => d);
  return (
    <>
      <Rows>
        <ListRow icon="loa" label={t('sfx')} trailing={<Toggle label={t('sfx')} checked={s.sfx} onChange={(sfx) => setDeviceSettings({ sfx })} />} />
        <ListRow icon="chuyen-dong" label={t('haptics')} trailing={<Toggle label={t('haptics')} checked={s.haptics} onChange={(haptics) => setDeviceSettings({ haptics })} />} />
        <ListRow icon="nhac" label={t('music')} trailing={<Toggle label={t('music')} checked={s.music} onChange={(music) => setDeviceSettings({ music })} />} />
      </Rows>
      <section className={card}>
        <ChoiceGroup name="track" legend={t('musicTrackLegend')} value={s.musicTrack} options={TRACKS.map((v) => ({ value: v, label: t(`track.${v}`) }))} onChange={(musicTrack) => setDeviceSettings({ musicTrack })} />
        <label className="flex flex-col gap-2">
          <span className="flex items-center gap-2 text-[15px] font-bold text-ink-soft">
            <Icon name="nhac" size={18} />
            {t('musicVolume')}
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.musicVolume}
            disabled={!s.music}
            onChange={(e) => setDeviceSettings({ musicVolume: Number(e.target.value) })}
            className="min-h-11 w-full accent-[var(--color-accent)]"
          />
        </label>
        <p className="m-0 text-sm text-ink-muted">{t('deviceOnly')}</p>
      </section>
    </>
  );
}
