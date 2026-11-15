import { useEffect, useRef, useState } from 'react';
import type { ToneId } from '@vietlearning/audio-dsp';
import { PitchReferenceFlyweight } from '@vietlearning/content';
import { getDeviceSpeech } from '@vietlearning/native';
import { ContourChart } from './ContourChart';
import { MAX_RECORD_MS, useToneRecorder, type RecorderError } from '../hooks/useToneRecorder';

const TONES = PitchReferenceFlyweight.all();

const ERRORS: Record<RecorderError, string> = {
  'permission-denied': 'App chưa được phép dùng micro. Vào Cài đặt › Ứng dụng › Bé Cu Tít › Quyền để bật Micro.',
  'no-microphone': 'Không tìm thấy micro trên thiết bị.',
  unsupported: 'Thiết bị này không hỗ trợ thu âm trong app.',
  failed: 'Không thu âm được. Vui lòng thử lại.',
  'no-voice': 'Chưa nghe rõ giọng. Hãy nói to hơn, gần micro hơn, kéo dài âm tiết khoảng nửa giây.',
  'too-short': 'Bản ghi quá ngắn. Giữ nút lâu hơn một chút khi nói.'
};

/** Chỉ khen "Rất tốt" khi thanh gần nhất đúng là thanh mục tiêu (tránh vừa khen vừa nói "giống thanh khác") */
export function verdict(score: number, matchesTarget: boolean): { text: string; tone: 'good' | 'ok' | 'bad' } {
  if (score >= 75 && matchesTarget) return { text: 'Rất tốt!', tone: 'good' };
  if (score >= 55) return { text: 'Gần đúng rồi', tone: 'ok' };
  return { text: 'Chưa đúng thanh', tone: 'bad' };
}

/**
 * Màn hình M2: luyện 6 thanh điệu.
 * Chọn thanh → nghe mẫu → ghi âm → Worker tính contour F0 (A1) và so với mẫu (A2) → biểu đồ + điểm.
 */
export function ToneLabScreen() {
  const [target, setTarget] = useState<ToneId>('sac');
  const tone = PitchReferenceFlyweight.get(target);
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
      .speak(tone.syllable, { rate: 0.8 })
      .catch(() => undefined); // máy không có giọng Việt: bỏ qua, người học vẫn xem được biểu đồ mẫu
  };

  const best = result ? PitchReferenceFlyweight.get(result.bestMatch) : null;
  const v = result ? verdict(result.targetScore.score, result.bestMatch === target) : null;

  return (
    <div className="min-h-dvh bg-canvas px-4 pb-8 pt-[calc(16px+env(safe-area-inset-top))] font-sans text-ink">
      <div className="mx-auto flex max-w-[560px] flex-col gap-5">
        <header className="flex flex-col gap-2 border-b-2 border-line pb-4">
          <h1 className="m-0 text-[26px] font-black leading-tight tracking-tight text-heading">Luyện 6 thanh điệu</h1>
          <p className="m-0 text-[15px] text-ink-soft">Chọn một thanh, nghe mẫu rồi bấm nút micro và đọc to âm tiết.</p>
        </header>

        <section aria-labelledby="ct-tone-pick">
          <h2 id="ct-tone-pick" className="mb-2 text-sm font-bold text-ink-soft">
            Chọn thanh
          </h2>
          <div role="radiogroup" aria-labelledby="ct-tone-pick" className="grid grid-cols-3 gap-2">
            {TONES.map((t) => {
              const active = t.id === target;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={recording || status === 'analyzing'}
                  onClick={() => setTarget(t.id)}
                  className={[
                    'flex min-h-16 flex-col items-center justify-center rounded-xl border px-1 leading-tight disabled:opacity-50',
                    active ? 'border-accent bg-accent-soft text-heading' : 'border-line bg-surface-2 text-ink-soft'
                  ].join(' ')}
                >
                  <span lang="vi" className="text-2xl font-black">
                    {t.syllable}
                  </span>
                  <span className="text-xs font-semibold">{t.name.replace('Thanh ', '')}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="ct-tone-card" className="flex flex-col gap-4 rounded-2xl border border-line-strong bg-surface p-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="ct-tone-card" className="m-0 text-lg font-extrabold text-ink">
                {tone.name} · <span lang="vi">“{tone.syllable}”</span>
              </h2>
              <p className="m-0 text-sm text-ink-soft">
                {tone.mark} · {tone.description}. Ví dụ: {tone.meaning}.
              </p>
            </div>
            <button
              type="button"
              onClick={playSample}
              className="min-h-11 shrink-0 rounded-xl border border-line bg-surface-2 px-3 text-sm font-bold text-ink"
            >
              🔈 Nghe mẫu
            </button>
          </div>

          <ContourChart
            reference={tone.contour}
            learner={result?.contour ?? null}
            label={`Biểu đồ cao độ ${tone.name}${result ? ', so với giọng của bạn' : ''}`}
          />

          <div className="flex flex-col items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => (recording ? void stop() : void start())}
              disabled={status === 'analyzing' || status === 'starting'}
              aria-pressed={recording}
              aria-label={recording ? 'Dừng ghi âm' : 'Bắt đầu ghi âm'}
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
              {status === 'idle' && 'Bấm để ghi âm, đọc to một lần'}
              {status === 'starting' && 'Đang mở micro…'}
              {status === 'recording' && `Đang nghe… (tự dừng sau ${MAX_RECORD_MS / 1000} giây, hoặc bấm để dừng)`}
              {status === 'analyzing' && 'Đang phân tích cao độ…'}
              {status === 'done' && 'Bấm để thử lại'}
              {status === 'error' && 'Bấm để thử lại'}
            </p>
          </div>

          {error && (
            <p role="alert" className="m-0 rounded-xl bg-danger-soft p-3 text-sm leading-relaxed text-danger-ink">
              {ERRORS[error]}
            </p>
          )}

          {result && v && best && (
            <div role="status" className="flex flex-col gap-2 rounded-xl border border-line bg-sunken p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={[
                    'text-lg font-extrabold',
                    v.tone === 'good' ? 'text-heading' : v.tone === 'ok' ? 'text-ink' : 'text-danger'
                  ].join(' ')}
                >
                  {v.text}
                </span>
                <span className="text-3xl font-black text-ink">
                  {result.targetScore.score}
                  <span className="text-base font-bold text-ink-muted">/100</span>
                </span>
              </div>
              <p className="m-0 text-[15px] text-ink-soft">
                {result.bestMatch === target ? (
                  <>Cao độ của bạn khớp nhất với {tone.name.toLowerCase()}.</>
                ) : (
                  <>
                    Nghe giống <strong className="text-ink">{best.name.toLowerCase()}</strong> (“{best.syllable}”) hơn. Mẹo:{' '}
                    {tone.description.toLowerCase()}.
                  </>
                )}
              </p>
              <p className="m-0 text-xs text-ink-muted">
                Giọng của bạn ~{result.medianHz} Hz · phân tích {result.processingMs} ms
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
