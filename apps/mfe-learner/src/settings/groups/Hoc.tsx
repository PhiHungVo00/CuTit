import { useEffect, useRef, useState } from 'react';
import { getDeviceSpeech } from '@vietlearning/native';
import { useLearner, type CorrectionLevel, type Dialect } from '@vietlearning/state';
import { ChoiceGroup, card, secondaryBtn } from '../../common/ui';
import { useT } from '../../i18n';
import { SyncLine } from '../parts';
import { usePrefsUpdate } from '../usePrefs';

interface Voice {
  id: string;
  name: string;
  dialect: Dialect;
}

/** Dùng khi chưa tải được danh sách từ Gateway (trùng danh sách mặc định của Gateway) */
const OFFLINE_VOICES: (Voice & { en: string })[] = [
  { id: 'vi-VN-Standard-A', name: 'Giọng Nữ Bắc (Hà Nội)', en: 'Northern female (Hanoi)', dialect: 'north' },
  { id: 'vi-VN-Standard-B', name: 'Giọng Nam Bắc (Hà Nội)', en: 'Northern male (Hanoi)', dialect: 'north' },
  { id: 'vi-VN-Standard-C', name: 'Giọng Nữ Nam (Sài Gòn)', en: 'Southern female (Saigon)', dialect: 'south' },
  { id: 'vi-VN-Standard-D', name: 'Giọng Nữ Trung (Huế)', en: 'Central female (Huế)', dialect: 'central' }
];

const DIALECTS: Dialect[] = ['north', 'central', 'south'];
const CORRECTION: CorrectionLevel[] = ['gentle', 'strict', 'off'];
const SAMPLE = 'Xin chào, mình là Bé Cu Tít. Hôm nay mình cùng học tiếng Việt nhé!';

async function fetchVoices(): Promise<Voice[] | null> {
  const [{ request }, { VoiceListResponseSchema }] = await Promise.all([import('@vietlearning/api-client'), import('@vietlearning/contracts/api')]);
  try {
    const list = await request('/v1/speech/voices', { schema: VoiceListResponseSchema });
    return list.length ? (list as Voice[]) : null;
  } catch {
    return null;
  }
}

/** Phương ngữ, giọng đọc, tốc độ, gia sư, mức sửa lỗi (chuyển từ PreferencesScreen cũ). Đổi phương ngữ ghi cả preferences.dialect và profile.dialect. */
export function Hoc() {
  const t = useT();
  const prefs = useLearner((s) => s.preferences);
  const { sync, update } = usePrefsUpdate();
  const [voices, setVoices] = useState<Voice[]>(() => OFFLINE_VOICES.map((v) => ({ ...v, name: prefs.uiLanguage === 'en' ? v.en : v.name })));
  const [speakError, setSpeakError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void fetchVoices().then((v) => v && mounted.current && setVoices(v));
    return () => {
      mounted.current = false;
    };
  }, []);

  const listen = async () => {
    setSpeakError(null);
    try {
      await getDeviceSpeech().speak(SAMPLE, { rate: prefs.speed });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== 'interrupted') setSpeakError(code === 'no-vietnamese-voice' ? t('noViVoice') : t('voiceFailed'));
    }
  };

  const voicesForDialect = voices.filter((v) => v.dialect === prefs.dialect);
  const shownVoices = voicesForDialect.length ? voicesForDialect : voices;

  return (
    <>
      <SyncLine sync={sync} />
      <section className={card} aria-labelledby="ct-voice">
        <h2 id="ct-voice" className="m-0 text-lg font-extrabold text-ink">
          {t('voiceSection')}
        </h2>
        <ChoiceGroup
          name="dialect"
          legend={t('dialectLegend')}
          value={prefs.dialect}
          options={DIALECTS.map((d) => ({ value: d, label: t(`dialect.${d}`) }))}
          onChange={(dialect) => {
            const first = voices.find((v) => v.dialect === dialect);
            update(first && !voices.some((v) => v.id === prefs.voiceId && v.dialect === dialect) ? { dialect, voiceId: first.id } : { dialect }, true);
          }}
        />
        <ChoiceGroup name="voice" legend={t('voiceLegend')} value={prefs.voiceId} options={shownVoices.map((v) => ({ value: v.id, label: v.name }))} onChange={(voiceId) => update({ voiceId })} />
        <label className="flex flex-col gap-2">
          <span className="flex justify-between text-[15px] font-bold text-ink-soft">
            <span>{t('speed')}</span>
            <span className="text-ink">{prefs.speed.toFixed(2).replace(/\.?0+$/, '')}×</span>
          </span>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.25}
            value={prefs.speed}
            onChange={(e) => update({ speed: Number(e.target.value) })}
            aria-valuetext={t('speedValue', { n: prefs.speed })}
            className="min-h-11 w-full accent-[var(--color-accent)]"
          />
        </label>
        <button type="button" className={secondaryBtn} onClick={() => void listen()}>
          {t('tryVoice')}
        </button>
        {speakError && (
          <p role="alert" className="m-0 rounded-xl bg-danger-soft p-3 text-[15px] text-danger-ink">
            {speakError}
          </p>
        )}
      </section>

      <section className={card} aria-labelledby="ct-tutor">
        <h2 id="ct-tutor" className="m-0 text-lg font-extrabold text-ink">
          {t('tutorSection')}
        </h2>
        <ChoiceGroup
          name="persona"
          legend={t('personaLegend')}
          value={prefs.persona}
          options={[
            { value: 'be_cu_tit', label: 'Bé Cu Tít', hint: t('persona.be_cu_tit.hint') },
            { value: 'co_giao', label: t('persona.co_giao'), hint: t('persona.co_giao.hint') }
          ]}
          onChange={(persona) => update({ persona })}
        />
        <ChoiceGroup
          name="correction"
          legend={t('correctionLegend')}
          value={prefs.correctionLevel}
          options={CORRECTION.map((c) => ({ value: c, label: t(`correction.${c}`), hint: t(`correction.${c}.hint`) }))}
          onChange={(correctionLevel) => update({ correctionLevel })}
        />
      </section>
    </>
  );
}
