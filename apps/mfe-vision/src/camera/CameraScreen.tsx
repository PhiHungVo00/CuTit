import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { canOpenAppSettings, fileToJpegBase64, openAppSettings, toJpegBase64 } from '@vietlearning/native';
import { learnerStore, useLearner } from '@vietlearning/state';
import { Button, CuTit, Icon } from '@vietlearning/ui';
import { SlowListen, say as sayAt } from '../listen';
import { t as tCam, useT } from '../i18n';

interface Label {
  vi: string;
  en: string;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'live' }
  | { kind: 'analyzing'; preview: string }
  | { kind: 'result'; preview: string; labels: Label[]; mock: boolean }
  | { kind: 'error'; message: string; preview?: string; settings?: boolean };

const full = { width: '100%' } as const;
const BASE = 0.85;
const say = (text: string) => sayAt(text, BASE);

async function labelImage(imageBase64: string): Promise<{ labels: Label[]; mock: boolean }> {
  const [{ request }, { VisionLabelResponseSchema }] = await Promise.all([import('@vietlearning/api-client'), import('@vietlearning/contracts/api')]);
  const r = await request('/v1/vision/label', { body: { imageBase64 }, schema: VisionLabelResponseSchema });
  return { labels: r.items.map(({ vi, en }) => ({ vi, en })), mock: r.mock };
}

async function describeError(err: unknown): Promise<string> {
  const { describeGatewayError } = await import('@vietlearning/api-client');
  return describeGatewayError(err, learnerStore.getState().preferences.uiLanguage);
}

/** Màn hình M4: chụp ảnh đồ vật (hoặc chọn ảnh) → Gateway dán nhãn tiếng Việt → nghe, lưu thẻ ôn. */
export function CameraScreen() {
  const t = useT();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  /** khóa đồng bộ (không chờ render): chạm “Chụp” hai lần nhanh không gửi hai ảnh */
  const sending = useRef(false);
  const srs = useLearner((s) => s.srs);
  const consent = useLearner((s) => s.consents.camera === true);
  /** Hộp xin đồng ý đang mở cho thao tác nào (chưa đồng ý thì không mở camera, không gửi ảnh) */
  const [ask, setAsk] = useState<null | 'camera' | 'pick'>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  // Rời màn hình: tắt camera (đèn báo camera tắt ngay, đỡ tốn pin)
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase({ kind: 'error', message: tCam('noCamera') });
      return;
    }
    setPhase({ kind: 'starting' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (!alive.current) return stream.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      setPhase({ kind: 'live' });
    } catch (err) {
      const name = (err as DOMException).name;
      if (name === 'NotAllowedError') setPhase({ kind: 'error', message: tCam('denied'), settings: true });
      else if (name === 'NotFoundError' || name === 'OverconstrainedError') setPhase({ kind: 'error', message: tCam('notFound') });
      else setPhase({ kind: 'error', message: tCam('busy') });
    }
  };

  // Gắn stream vào <video> sau khi phần tử xuất hiện
  useEffect(() => {
    if (phase.kind === 'live' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [phase.kind]);

  const analyze = async (image: { base64: string; previewUrl: string }) => {
    // Lớp chặn cuối: không có đồng ý thì không gửi ảnh đi đâu cả
    if (!learnerStore.getState().consents.camera) return setPhase({ kind: 'idle' });
    setPhase({ kind: 'analyzing', preview: image.previewUrl });
    try {
      const r = await labelImage(image.base64);
      if (alive.current) setPhase({ kind: 'result', preview: image.previewUrl, labels: r.labels, mock: r.mock });
    } catch (err) {
      if (alive.current) setPhase({ kind: 'error', message: await describeError(err), preview: image.previewUrl });
    }
  };

  const capture = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || sending.current) return;
    sending.current = true;
    try {
      const image = await toJpegBase64(v, v.videoWidth, v.videoHeight);
      stopCamera();
      await analyze(image);
    } finally {
      sending.current = false;
    }
  };

  const openCamera = () => (consent ? void startCamera() : setAsk('camera'));
  const pickPhoto = () => (consent ? fileRef.current?.click() : setAsk('pick'));

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    stopCamera();
    try {
      await analyze(await fileToJpegBase64(file));
    } catch {
      setPhase({ kind: 'error', message: tCam('badFile') });
    }
  };

  const save = (l: Label) => learnerStore.getState().addCard({ itemRef: `vision:${l.vi.toLowerCase()}`, front: l.vi, back: l.en, source: 'vision' });
  const preview = 'preview' in phase ? phase.preview : undefined;

  return (
    <div className="min-h-dvh bg-canvas px-4 pb-8 pt-[calc(16px+env(safe-area-inset-top))] font-sans text-ink">
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">
        <header className="flex items-center justify-between gap-2 border-b-2 border-line pb-4">
          <h1 className="m-0 text-[26px] font-black leading-tight tracking-tight text-heading">{t('title')}</h1>
          <Link to="/ho-so" className="flex min-h-11 items-center gap-1 rounded-xl border border-line-strong bg-surface px-3 text-sm font-bold text-ink no-underline">
            <Icon name="ho-so" size={18} />
            {t('cardsLink')}
          </Link>
        </header>

        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-line-strong bg-sunken">
          {phase.kind === 'live' && <video ref={videoRef} playsInline muted aria-label={t('videoLabel')} className="size-full object-cover" />}
          {preview && phase.kind !== 'live' && <img src={preview} alt={t('photoAlt')} className="size-full object-cover" />}
          {!preview && phase.kind !== 'live' && (
            <p className="m-0 grid size-full place-items-center p-4 text-center text-[15px] text-ink-muted">
              {phase.kind === 'starting' ? t('opening') : t('intro')}
            </p>
          )}
        </div>

        {phase.kind === 'live' ? (
          <div className="flex flex-col gap-2">
            <Button style={full} onClick={() => void capture()}>
              <Icon name="camera" size={20} />
              {t('capture')}
            </Button>
            <Button
              variant="secondary"
              style={full}
              onClick={() => {
                stopCamera();
                setPhase({ kind: 'idle' });
              }}
            >
              {t('cameraOff')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button style={full} disabled={phase.kind === 'starting' || phase.kind === 'analyzing'} onClick={openCamera}>
              <Icon name="camera" size={20} />
              {phase.kind === 'result' || phase.kind === 'error' ? t('another') : t('openCamera')}
            </Button>
            <Button variant="secondary" style={full} disabled={phase.kind === 'analyzing'} onClick={pickPhoto}>
              {t('pick')}
            </Button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void onFile(e)} aria-hidden="true" tabIndex={-1} />
          </div>
        )}

        {ask && (
          <div role="dialog" aria-labelledby="ct-camera-consent" className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-3">
            <p id="ct-camera-consent" className="m-0 text-[15px] font-bold text-ink">
              {t('consentTitle')}
            </p>
            <p className="m-0 text-sm text-ink-soft">{t('consentShort')}</p>
            <details className="text-sm text-ink-soft">
              <summary className="flex min-h-11 cursor-pointer items-center font-bold text-ink">{t('consentDetails')}</summary>
              <p className="m-0 pb-2">{t('consentBody')}</p>
            </details>
            <Link to="/quyen-rieng-tu" className="self-start text-sm font-bold text-ink underline">
              {t('privacyPolicy')}
            </Link>
            <div className="sticky bottom-0 grid grid-cols-2 gap-2 bg-surface-2 pb-1 pt-2">
              <Button variant="secondary" onClick={() => setAsk(null)}>
                {t('consentNo')}
              </Button>
              <Button
                onClick={() => {
                  const next = ask;
                  learnerStore.getState().giveConsent('camera');
                  setAsk(null);
                  if (next === 'camera') void startCamera();
                  else fileRef.current?.click();
                }}
              >
                {t('consentAgree')}
              </Button>
            </div>
          </div>
        )}

        <p className="m-0 text-xs text-ink-muted">{t('privacy')}</p>

        {phase.kind === 'analyzing' && (
          <p role="status" className="m-0 flex items-center gap-2 text-[15px] text-ink-muted">
            <CuTit mood="suy-nghi" size={56} />
            {t('analyzing')}
          </p>
        )}

        {phase.kind === 'error' && (
          <div role="alert" className="flex flex-col gap-2 rounded-xl bg-danger-soft p-3 text-danger-ink">
            <p className="m-0 text-[15px]">{phase.message}</p>
            {phase.settings && canOpenAppSettings() && (
              <Button variant="secondary" style={full} onClick={() => void openAppSettings()}>
                <Icon name="cai-dat" size={18} />
                {t('openSettings')}
              </Button>
            )}
          </div>
        )}

        {phase.kind === 'result' && (
          <section aria-labelledby="ct-labels" className="flex flex-col gap-3 rounded-2xl border border-line-strong bg-surface p-4 shadow-card">
            <h2 id="ct-labels" aria-live="polite" className="m-0 text-lg font-extrabold text-ink">
              {phase.labels.length ? t('found') : t('none')}
            </h2>
            {phase.mock && <p className="m-0 rounded-lg bg-surface-2 p-2 text-sm text-ink-muted">{t('mock')}</p>}
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {phase.labels.map((l) => {
                const saved = !!srs[`vision:${l.vi.toLowerCase()}`];
                return (
                  <li key={l.vi} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-2">
                    <span className="min-w-0 flex-1">
                      <span lang="vi" className="block text-lg font-bold text-ink">
                        {l.vi}
                      </span>
                      <span lang="en" className="text-sm text-ink-muted">
                        {l.en}
                      </span>
                    </span>
                    <Button variant="secondary" onClick={() => void say(l.vi)} aria-label={t('listenTo', { word: l.vi })}>
                      <Icon name="loa" size={18} />
                    </Button>
                    <SlowListen text={l.vi} base={BASE} className="min-h-11 min-w-11 rounded-xl border border-line bg-surface px-3 text-lg" />
                    <Button variant="secondary" disabled={saved} onClick={() => save(l)}>
                      {saved ? t('saved') : t('save')}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
