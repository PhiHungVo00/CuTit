import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDeviceSpeech } from '@vietlearning/native';
import { learnerStore, useLearner, type CorrectionLevel, type Dialect, type Preferences, type UiLanguage } from '@vietlearning/state';
import { progressStore } from '@vietlearning/state/progress';
import { ChoiceGroup, ScreenFrame, card, linkBtn, secondaryBtn } from '../common/ui';
import { useT } from '../i18n';

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
const UI_LANGS: { value: UiLanguage; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'vi', label: 'Tiếng Việt' }
];

const SAMPLE = 'Xin chào, mình là Bé Cu Tít. Hôm nay mình cùng học tiếng Việt nhé!';

type Sync = 'idle' | 'saving' | 'synced' | 'local';

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

async function fetchVoices(): Promise<Voice[] | null> {
  const [{ request }, { VoiceListResponseSchema }] = await Promise.all([import('@vietlearning/api-client'), import('@vietlearning/contracts/api')]);
  try {
    const list = await request('/v1/speech/voices', { schema: VoiceListResponseSchema });
    return list.length ? (list as Voice[]) : null;
  } catch {
    return null;
  }
}

/** Màn hình M12: giọng đọc, tốc độ, phương ngữ, mức sửa lỗi, nhân vật; nghe thử; xóa dữ liệu trên máy. */
export function PreferencesScreen() {
  const t = useT();
  const prefs = useLearner((s) => s.preferences);
  const [voices, setVoices] = useState<Voice[]>(() => OFFLINE_VOICES.map((v) => ({ ...v, name: prefs.uiLanguage === 'en' ? v.en : v.name })));
  const [sync, setSync] = useState<Sync>('idle');
  const [speakError, setSpeakError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void fetchVoices().then((v) => v && mounted.current && setVoices(v));
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  const update = (patch: Partial<Preferences>) => {
    learnerStore.getState().setPreferences(patch);
    setSync('saving');
    // gộp các thay đổi liên tiếp (kéo thanh tốc độ) thành một lần gửi
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const ok = await pushPreferences(learnerStore.getState().preferences);
      if (mounted.current) setSync(ok ? 'synced' : 'local');
    }, 600);
  };

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
    <ScreenFrame
      title={t('prefsTitle')}
      action={
        <Link to="/ho-so" className={linkBtn}>
          {t('progressLink')}
        </Link>
      }
    >
      <p role="status" className="m-0 min-h-5 text-sm text-ink-muted">
        {sync === 'saving' && t('saving')}
        {sync === 'synced' && t('synced')}
        {sync === 'local' && t('localOnly')}
      </p>

      <section className={card} aria-labelledby="ct-app">
        <h2 id="ct-app" className="m-0 text-lg font-extrabold text-ink">
          {t('appSection')}
        </h2>
        <ChoiceGroup name="uilang" legend={t('uiLangLegend')} value={prefs.uiLanguage} options={UI_LANGS} onChange={(uiLanguage) => update({ uiLanguage })} />
      </section>

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
            update(first && !voices.some((v) => v.id === prefs.voiceId && v.dialect === dialect) ? { dialect, voiceId: first.id } : { dialect });
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

      <section className={card} aria-labelledby="ct-privacy">
        <h2 id="ct-privacy" className="m-0 text-lg font-extrabold text-ink">
          {t('privacySection')}
        </h2>
        <p className="m-0 text-[15px] text-ink-soft">{t('privacyAi')}</p>
        <p className="m-0 text-[15px] text-ink-soft">{t('privacyLocal')}</p>
      </section>

      <section className={card} aria-labelledby="ct-data">
        <h2 id="ct-data" className="m-0 text-lg font-extrabold text-ink">
          {t('dataSection')}
        </h2>
        <p className="m-0 text-[15px] text-ink-soft">{t('dataHint')}</p>
        {!confirmReset ? (
          <button type="button" className={secondaryBtn} onClick={() => setConfirmReset(true)}>
            {t('resetAsk')}
          </button>
        ) : (
          <div role="alert" className="flex flex-col gap-2 rounded-xl bg-danger-soft p-3 text-danger-ink">
            <p className="m-0 text-[15px] font-bold">{t('resetConfirm')}</p>
            <button
              type="button"
              className="min-h-12 w-full rounded-xl bg-danger px-4 font-extrabold text-white"
              onClick={() => {
                learnerStore.getState().reset();
                // Tiến độ lộ trình (XP, bài đã xong, đóng băng, nhắc học) lưu ở khóa riêng: xóa cùng lúc
                progressStore.getState().resetProgress();
                setConfirmReset(false);
                setSync('idle');
              }}
            >
              {t('resetYes')}
            </button>
            <button type="button" className={secondaryBtn} onClick={() => setConfirmReset(false)}>
              {t('cancel')}
            </button>
          </div>
        )}
      </section>
    </ScreenFrame>
  );
}
