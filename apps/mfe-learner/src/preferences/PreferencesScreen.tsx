import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDeviceSpeech } from '@vietlearning/native';
import { learnerStore, useLearner, type CorrectionLevel, type Dialect, type Preferences } from '@vietlearning/state';
import { ChoiceGroup, ScreenFrame, card, linkBtn, secondaryBtn } from '../common/ui';

interface Voice {
  id: string;
  name: string;
  dialect: Dialect;
}

/** Dùng khi chưa tải được danh sách từ Gateway (trùng danh sách mặc định của Gateway) */
const OFFLINE_VOICES: Voice[] = [
  { id: 'vi-VN-Standard-A', name: 'Giọng Nữ Bắc (Hà Nội)', dialect: 'north' },
  { id: 'vi-VN-Standard-B', name: 'Giọng Nam Bắc (Hà Nội)', dialect: 'north' },
  { id: 'vi-VN-Standard-C', name: 'Giọng Nữ Nam (Sài Gòn)', dialect: 'south' },
  { id: 'vi-VN-Standard-D', name: 'Giọng Nữ Trung (Huế)', dialect: 'central' }
];

const DIALECTS: { value: Dialect; label: string }[] = [
  { value: 'north', label: 'Miền Bắc' },
  { value: 'central', label: 'Miền Trung' },
  { value: 'south', label: 'Miền Nam' }
];

const CORRECTION: { value: CorrectionLevel; label: string; hint: string }[] = [
  { value: 'gentle', label: 'Nhẹ nhàng', hint: 'Chỉ sửa lỗi quan trọng, nhiều lời khen' },
  { value: 'strict', label: 'Kỹ lưỡng', hint: 'Sửa cả lỗi nhỏ về thanh điệu, xưng hô' },
  { value: 'off', label: 'Không sửa', hint: 'Chỉ trò chuyện tự do' }
];

const PERSONAS = [
  { value: 'be_cu_tit', label: 'Bé Cu Tít', hint: 'Vui tươi, hay khích lệ' },
  { value: 'co_giao', label: 'Cô giáo Lan', hint: 'Điềm đạm, giải thích kỹ' }
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
  const prefs = useLearner((s) => s.preferences);
  const [voices, setVoices] = useState<Voice[]>(OFFLINE_VOICES);
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
      if (code !== 'interrupted') setSpeakError(code === 'no-vietnamese-voice' ? 'Máy chưa có giọng đọc tiếng Việt. Hãy cài trong phần Cài đặt > Chuyển văn bản thành giọng nói.' : 'Không phát được giọng đọc trên máy này.');
    }
  };

  const voicesForDialect = voices.filter((v) => v.dialect === prefs.dialect);
  const shownVoices = voicesForDialect.length ? voicesForDialect : voices;

  return (
    <ScreenFrame
      title="Tùy chỉnh"
      action={
        <Link to="/ho-so" className={linkBtn}>
          📈 Tiến độ
        </Link>
      }
    >
      <p role="status" className="m-0 min-h-5 text-sm text-ink-muted">
        {sync === 'saving' && 'Đang lưu…'}
        {sync === 'synced' && '✓ Đã lưu và đồng bộ'}
        {sync === 'local' && '✓ Đã lưu trên máy · chưa đồng bộ được với máy chủ'}
      </p>

      <section className={card} aria-labelledby="ct-voice">
        <h2 id="ct-voice" className="m-0 text-lg font-extrabold text-ink">
          Giọng đọc
        </h2>
        <ChoiceGroup
          name="dialect"
          legend="Phương ngữ"
          value={prefs.dialect}
          options={DIALECTS}
          onChange={(dialect) => {
            const first = voices.find((v) => v.dialect === dialect);
            update(first && !voices.some((v) => v.id === prefs.voiceId && v.dialect === dialect) ? { dialect, voiceId: first.id } : { dialect });
          }}
        />
        <ChoiceGroup name="voice" legend="Giọng (máy chủ dùng khi đọc bằng AI)" value={prefs.voiceId} options={shownVoices.map((v) => ({ value: v.id, label: v.name }))} onChange={(voiceId) => update({ voiceId })} />
        <label className="flex flex-col gap-2">
          <span className="flex justify-between text-[15px] font-bold text-ink-soft">
            <span>Tốc độ đọc</span>
            <span className="text-ink">{prefs.speed.toFixed(2).replace(/\.?0+$/, '')}×</span>
          </span>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.25}
            value={prefs.speed}
            onChange={(e) => update({ speed: Number(e.target.value) })}
            aria-valuetext={`${prefs.speed} lần`}
            className="min-h-11 w-full accent-[var(--color-accent)]"
          />
        </label>
        <button type="button" className={secondaryBtn} onClick={() => void listen()}>
          🔈 Nghe thử
        </button>
        {speakError && (
          <p role="alert" className="m-0 rounded-xl bg-danger-soft p-3 text-[15px] text-danger-ink">
            {speakError}
          </p>
        )}
      </section>

      <section className={card} aria-labelledby="ct-tutor">
        <h2 id="ct-tutor" className="m-0 text-lg font-extrabold text-ink">
          Gia sư
        </h2>
        <ChoiceGroup name="persona" legend="Nhân vật trò chuyện" value={prefs.persona} options={PERSONAS} onChange={(persona) => update({ persona })} />
        <ChoiceGroup name="correction" legend="Mức sửa lỗi" value={prefs.correctionLevel} options={CORRECTION} onChange={(correctionLevel) => update({ correctionLevel })} />
      </section>

      <section className={card} aria-labelledby="ct-data">
        <h2 id="ct-data" className="m-0 text-lg font-extrabold text-ink">
          Dữ liệu trên máy
        </h2>
        <p className="m-0 text-[15px] text-ink-soft">Tiến độ, thẻ ôn và tùy chỉnh đang lưu trên điện thoại này.</p>
        {!confirmReset ? (
          <button type="button" className={secondaryBtn} onClick={() => setConfirmReset(true)}>
            Xóa dữ liệu học…
          </button>
        ) : (
          <div role="alert" className="flex flex-col gap-2 rounded-xl bg-danger-soft p-3 text-danger-ink">
            <p className="m-0 text-[15px] font-bold">Xóa toàn bộ tiến độ, thẻ ôn và tùy chỉnh? Không thể hoàn tác.</p>
            <button
              type="button"
              className="min-h-12 w-full rounded-xl bg-danger px-4 font-extrabold text-white"
              onClick={() => {
                learnerStore.getState().reset();
                setConfirmReset(false);
                setSync('idle');
              }}
            >
              Xóa hết
            </button>
            <button type="button" className={secondaryBtn} onClick={() => setConfirmReset(false)}>
              Hủy
            </button>
          </div>
        )}
      </section>
    </ScreenFrame>
  );
}
