import { useEffect, useRef, useState } from 'react';
import type { ToneId } from '@vietlearning/audio-dsp';
import { PitchReferenceFlyweight } from '@vietlearning/content';
import { canOpenAppSettings, getDeviceSpeech, openAppSettings } from '@vietlearning/native';
import { speechRate, useLearner } from '@vietlearning/state';
import { ContourChart, MAX_RECORD_MS, useToneRecorder, verdict } from '@vietlearning/exercises';
import { useT } from '../i18n';

const TONES = PitchReferenceFlyweight.all();

/**
 * Màn hình M2: luyện 6 thanh điệu.
 * Chọn thanh → nghe mẫu → ghi âm → Worker tính contour F0 (A1) và so với mẫu (A2) → biểu đồ + điểm.
 */
export function ToneLabScreen() {
  const t = useT();
  const en = useLearner((s) => s.preferences.uiLanguage) === 'en';
  const [target, setTarget] = useState<ToneId>('sac');
  const tone = PitchReferenceFlyweight.get(target);
  const nameOf = (x: typeof tone) => (en ? x.nameEn : x.name);
  const { status, error, result, level, start, stop } = useToneRecorder(target);
  const recording = status === 'recording' || status === 'starting';

  // Trên điện thoại, kết quả/lỗi nằm dưới nút micro (ngoài màn hình): tự cuộn tới khi có
  const feedbackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (status === 'done' || status === 'error') {
      feedbackRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [status]);

  const playSample = () => {
    getDeviceSpeech()
      .speak(tone.syllable, { rate: speechRate(0.8) })
      .catch(() => undefined); // máy không có giọng Việt: bỏ qua, người học vẫn xem được biểu đồ mẫu
  };

  const best = result ? PitchReferenceFlyweight.get(result.bestMatch) : null;
  const v = result ? verdict(result.targetScore.score, result.bestMatch === target) : null;

  return (
    <div className="min-h-dvh bg-canvas px-4 pb-8 pt-[calc(16px+env(safe-area-inset-top))] font-sans text-ink">
      <div className="mx-auto flex max-w-[560px] flex-col gap-5">
        <header className="flex flex-col gap-2 border-b-2 border-line pb-4">
          <h1 className="m-0 text-[26px] font-black leading-tight tracking-tight text-heading">{t('toneTitle')}</h1>
          <p className="m-0 text-[15px] text-ink-soft">{t('toneIntro')}</p>
        </header>

        <section aria-labelledby="ct-tone-pick">
          <h2 id="ct-tone-pick" className="mb-2 text-sm font-bold text-ink-soft">
            {t('pickTone')}
          </h2>
          <div role="radiogroup" aria-labelledby="ct-tone-pick" className="grid grid-cols-3 gap-2">
            {TONES.map((tn) => {
              const active = tn.id === target;
              return (
                <button
                  key={tn.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={recording || status === 'analyzing'}
                  onClick={() => setTarget(tn.id)}
                  className={[
                    'flex min-h-16 flex-col items-center justify-center rounded-xl border px-1 leading-tight disabled:opacity-50',
                    active ? 'border-accent bg-accent-soft text-heading' : 'border-line bg-surface-2 text-ink-soft'
                  ].join(' ')}
                >
                  <span lang="vi" className="text-2xl font-black">
                    {tn.syllable}
                  </span>
                  <span className="text-xs font-semibold">{en ? tn.nameEn.replace(' tone', '') : tn.name.replace('Thanh ', '')}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="ct-tone-card" className="flex flex-col gap-4 rounded-2xl border border-line-strong bg-surface p-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="ct-tone-card" className="m-0 text-lg font-extrabold text-ink">
                {nameOf(tone)} · <span lang="vi">“{tone.syllable}”</span>
              </h2>
              <p className="m-0 text-sm text-ink-soft">
                {en ? tone.markEn : tone.mark} · {en ? tone.descriptionEn : tone.description}. {t('example', { meaning: en ? tone.meaningEn : tone.meaning })}
              </p>
            </div>
            <button
              type="button"
              onClick={playSample}
              className="min-h-11 shrink-0 rounded-xl border border-line bg-surface-2 px-3 text-sm font-bold text-ink"
            >
              {t('playSample')}
            </button>
          </div>

          <ContourChart
            reference={tone.contour}
            learner={result?.contour ?? null}
            label={t('chartLabel', { tone: nameOf(tone).toLowerCase() }) + (result ? t('chartVsYou') : '')}
          />

          <div className="flex flex-col items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => (recording ? void stop() : void start())}
              disabled={status === 'analyzing' || status === 'starting'}
              aria-pressed={recording}
              aria-label={recording ? t('stopRec') : t('startRec')}
              className={[
                'relative grid size-20 place-items-center rounded-full text-3xl shadow-card transition-transform active:scale-95 disabled:opacity-60',
                recording ? 'bg-danger text-white' : 'bg-accent text-accent-ink'
              ].join(' ')}
            >
              {/* Vòng mức âm lượng: người học thấy micro đang nghe */}
              {status === 'recording' && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-full border-4 border-danger"
                  style={{ transform: `scale(${1 + level * 0.35})`, opacity: 0.35 + level * 0.5 }}
                />
              )}
              <span aria-hidden="true">{recording ? '⏹️' : '🎙️'}</span>
            </button>
            <p className="m-0 min-h-6 text-center text-sm text-ink-soft" aria-live="polite">
              {status === 'idle' && t('status.idle')}
              {status === 'starting' && t('status.starting')}
              {status === 'recording' && t('status.recording', { s: MAX_RECORD_MS / 1000 })}
              {status === 'analyzing' && t('status.analyzing')}
              {(status === 'done' || status === 'error') && t('status.again')}
            </p>
          </div>

          {error && (
            <div role="alert" className="flex flex-col gap-3 rounded-xl bg-danger-soft p-3 text-sm leading-relaxed text-danger-ink">
              <p className="m-0">{t(`err.${error}`)}</p>
              {/* Đã từ chối vĩnh viễn thì Android không hỏi lại: đưa thẳng tới trang quyền của app */}
              {error === 'permission-denied' && canOpenAppSettings() && (
                <button
                  type="button"
                  onClick={() => void openAppSettings()}
                  className="min-h-11 self-start rounded-xl bg-danger px-4 font-bold text-white"
                >
                  {t('openSettings')}
                </button>
              )}
            </div>
          )}

          {result && v && best && (
            <div role="status" className="flex flex-col gap-2 rounded-xl border border-line bg-sunken p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={[
                    'text-lg font-extrabold',
                    v === 'good' ? 'text-heading' : v === 'ok' ? 'text-ink' : 'text-danger'
                  ].join(' ')}
                >
                  {t(`verdict.${v}`)}
                </span>
                <span className="text-3xl font-black text-ink">
                  {result.targetScore.score}
                  <span className="text-base font-bold text-ink-muted">/100</span>
                </span>
              </div>
              <p className="m-0 text-[15px] text-ink-soft">
                {result.bestMatch === target ? (
                  t('matchesTarget', { tone: nameOf(tone).toLowerCase() })
                ) : (
                  t('soundsLike', { tone: nameOf(best).toLowerCase(), syllable: best.syllable, tip: (en ? tone.descriptionEn : tone.description).toLowerCase() })
                )}
              </p>
              <p className="m-0 text-xs text-ink-muted">
                {t('voiceStats', { hz: result.medianHz, ms: result.processingMs })}
              </p>
            </div>
          )}
          {/* Neo cuộn đặt SAU kết quả; scroll-mb chừa chỗ cho thanh tab dưới đáy */}
          <div ref={feedbackRef} aria-hidden="true" className="scroll-mb-[calc(80px+env(safe-area-inset-bottom))]" />
        </section>
      </div>
    </div>
  );
}
