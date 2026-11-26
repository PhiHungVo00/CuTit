import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@vietlearning/ui';
import { FEEDBACK_LIMITS, type FeedbackContext, type FeedbackKind } from '@vietlearning/contracts/api';
import { GatewayRequestError } from '@vietlearning/api-client';
import { submitFeedback } from '@vietlearning/api-client/feedback';
import { useUiLanguage } from '@vietlearning/state';
import { ChoiceGroup, ScreenFrame, BusyLabel, card, linkBtn, primaryBtn, secondaryBtn } from '../common/ui';
import { useT } from '../i18n';
import { clearDraft, loadDraft, saveDraft } from './feedbackDraft';
import { prepareImage } from './prepareImage';
import { readVideoDurationMs } from './videoDuration';

export interface FeedbackScreenProps {
  initialKind?: FeedbackKind;
  /** Có khi mở từ màn lỗi (ScreenErrorBoundary) */
  error?: { name: string; firstFrame: string };
  /** Host dựng (màn trước, 5 đường dẫn gần nhất, phiên bản…): MFE không biết lịch sử điều hướng */
  context: Omit<FeedbackContext, 'error'>;
}

interface Photo {
  id: number;
  blob: Blob;
  url: string;
}
interface Clip {
  file: File;
  durationMs: number;
}
type Status = 'idle' | 'sending' | 'error' | 'done';
type MsgKey = Parameters<ReturnType<typeof useT>>[0];

const KINDS: FeedbackKind[] = ['bug', 'idea', 'other'];
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const tempUrl = (b: Blob) => (typeof URL.createObjectURL === 'function' ? URL.createObjectURL(b) : '');

/** Mã lỗi Gateway (trường `error`) → câu dễ hiểu; rớt mạng/hết giờ → báo "Gửi lại" được */
function errorKey(err: unknown): MsgKey {
  if (err instanceof GatewayRequestError) {
    switch (err.code) {
      case 'feedback_limit':
        return 'fbErrLimit';
      case 'file_too_large':
        return 'fbErrBig';
      case 'file_type':
        return 'fbErrFileType';
      case 'too_many_files':
        return 'fbErrTooMany';
      case 'storage_full':
        return 'fbErrStorage';
    }
    if (err.kind === 'offline' || err.kind === 'timeout') return 'fbErrOffline';
  }
  return 'fbErrOther';
}

/**
 * M-Góp ý / Báo lỗi (dự án 5a). Gửi một yêu cầu multipart; lỗi mạng thì GIỮ NGUYÊN chữ + tệp trên màn để "Gửi lại".
 * Ảnh được vẽ lại thành WebP trên máy (mất EXIF/GPS); video chỉ kiểm độ dài và dung lượng, không nén.
 * Quyền camera/thư viện: dùng bộ chọn tệp của hệ điều hành, hệ thống chỉ hỏi đúng lúc người dùng bấm thêm ảnh/video.
 */
export function FeedbackScreen({ initialKind, error, context }: FeedbackScreenProps) {
  const t = useT();
  const lang = useUiLanguage();
  const [draft] = useState(loadDraft);
  const [kind, setKind] = useState<FeedbackKind>(initialKind ?? draft?.kind ?? 'bug');
  const [body, setBody] = useState(draft?.body ?? '');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [clip, setClip] = useState<Clip | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState<MsgKey | null>(null);
  const [busyFiles, setBusyFiles] = useState(false);
  const nextId = useRef(1);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => {
    if (status !== 'done') saveDraft({ kind, body });
  }, [kind, body, status]);
  useEffect(
    () => () => {
      urls.current.forEach((u) => URL.revokeObjectURL?.(u));
    },
    []
  );

  const bodyLen = [...body.trim()].length;
  const canSend = bodyLen >= FEEDBACK_LIMITS.bodyMin && bodyLen <= FEEDBACK_LIMITS.bodyMax && status !== 'sending' && !busyFiles;

  const addImages = async (list: FileList | null) => {
    const files = Array.from(list ?? []).slice(0, FEEDBACK_LIMITS.images - photos.length);
    if (files.length === 0) return;
    setMsg(null);
    setBusyFiles(true);
    const added: Photo[] = [];
    for (const f of files) {
      try {
        const blob = await prepareImage(f);
        const url = tempUrl(blob);
        if (url) urls.current.push(url);
        added.push({ id: nextId.current++, blob, url });
      } catch (e) {
        setMsg(e instanceof Error && e.message === 'image_too_large' ? 'fbErrImageBig' : 'fbErrImageRead');
      }
    }
    setPhotos((p) => [...p, ...added].slice(0, FEEDBACK_LIMITS.images));
    setBusyFiles(false);
  };

  const addVideo = async (list: FileList | null) => {
    const file = list?.[0];
    if (!file || clip) return;
    setMsg(null);
    if (file.size > FEEDBACK_LIMITS.videoBytes) return setMsg('fbErrVideoBig');
    setBusyFiles(true);
    try {
      const durationMs = await readVideoDurationMs(file);
      if (durationMs > FEEDBACK_LIMITS.videoMs) setMsg('fbErrVideoLong');
      else setClip({ file, durationMs });
    } catch {
      setMsg('fbErrVideoRead');
    }
    setBusyFiles(false);
  };

  const send = async () => {
    if (!canSend) return;
    setStatus('sending');
    setMsg(null);
    const files: Blob[] = [...photos.map((p) => p.blob), ...(clip ? [clip.file] : [])];
    try {
      await submitFeedback({ kind, body: body.trim(), context: { ...context, ...(error ? { error } : {}) } }, files, setProgress);
      clearDraft();
      setStatus('done');
    } catch (e) {
      setMsg(errorKey(e));
      setStatus('error');
    }
  };

  const reset = () => {
    setBody('');
    setPhotos([]);
    setClip(null);
    setMsg(null);
    setProgress(0);
    setStatus('idle');
  };

  const attached = useMemo(
    () =>
      t('fbAttached', { version: context.appVersion, build: context.build, os: context.osVersion, lang: t(context.locale === 'en' ? 'fbLang.en' : 'fbLang.vi'), route: context.route }) +
      (error ? t('fbAttachedError', { name: error.name }) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, lang, context, error]
  );

  if (status === 'done') {
    return (
      <ScreenFrame title={t('fbTitle')}>
        <EmptyState
          mood="khen"
          title={t('fbThanks')}
          action={
            <>
              <Link to="/gop-y/cua-toi" className={linkBtn + ' justify-center'}>
                {t('fbMine')}
              </Link>
              <button type="button" className={secondaryBtn} onClick={reset}>
                {t('fbAnother')}
              </button>
            </>
          }
        />
      </ScreenFrame>
    );
  }

  const chip = 'min-h-11 rounded-xl border-2 border-dashed border-line-strong bg-surface px-3 text-sm font-bold text-ink disabled:opacity-50';
  const x = 'absolute flex items-center justify-center rounded-full bg-transparent p-0';
  const xBox = { top: -14, right: -14, width: 44, height: 44 };
  return (
    <ScreenFrame title={t('fbTitle')} action={undefined}>
      <section className={card}>
        <ChoiceGroup name="fb-kind" legend={t('fbKindLegend')} value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k, label: t(`fbKind.${k}` as MsgKey) }))} />

        <label className="flex flex-col gap-1">
          <span className="text-[15px] font-bold text-ink-soft">{t('fbBodyLabel')}</span>
          <textarea
            value={body}
            maxLength={FEEDBACK_LIMITS.bodyMax}
            rows={5}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('fbBodyHint')}
            aria-describedby="fb-count"
            className="w-full rounded-xl border-2 border-line bg-surface-2 p-3 text-base text-ink"
          />
          <span id="fb-count" className="self-end text-sm text-ink-muted">
            {t('fbCount', { n: [...body].length, max: FEEDBACK_LIMITS.bodyMax })}
          </span>
        </label>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 p-0 text-[15px] font-bold text-ink-soft">{t('fbAttachLegend')}</legend>
          <div className="flex flex-wrap items-center gap-3">
            {photos.map((p, i) => (
              <div key={p.id} className="relative shrink-0" style={{ width: 64, height: 64 }}>
                {p.url ? <img src={p.url} alt={t('fbImageAlt', { n: i + 1 })} className="rounded-xl object-cover" style={{ width: 64, height: 64 }} /> : <span className="flex items-center justify-center rounded-xl bg-surface-2" style={{ width: 64, height: 64 }}>🖼️</span>}
                <button type="button" aria-label={t('fbRemoveImage', { n: i + 1 })} className={x} style={xBox} onClick={() => setPhotos((l) => l.filter((q) => q.id !== p.id))}>
                  <span aria-hidden="true" className="flex items-center justify-center rounded-full bg-heading text-sm text-canvas" style={{ width: 24, height: 24 }}>
                    ✕
                  </span>
                </button>
              </div>
            ))}
            {clip && (
              <div className="relative flex items-center rounded-xl bg-surface-2 px-3 text-sm font-bold text-ink" style={{ height: 64, minWidth: 64 }}>
                <span aria-hidden="true">▶&nbsp;</span>
                {t('fbVideoItem', { time: clock(clip.durationMs) })}
                <button type="button" aria-label={t('fbRemoveVideo')} className={x} style={xBox} onClick={() => setClip(null)}>
                  <span aria-hidden="true" className="flex items-center justify-center rounded-full bg-heading text-sm text-canvas" style={{ width: 24, height: 24 }}>
                    ✕
                  </span>
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={chip} disabled={photos.length >= FEEDBACK_LIMITS.images || busyFiles} onClick={() => imageInput.current?.click()}>
              ＋ {t('fbAddImage')}
            </button>
            <button type="button" className={chip} disabled={clip !== null || busyFiles} onClick={() => videoInput.current?.click()}>
              ＋ {t('fbAddVideo')}
            </button>
          </div>
          {busyFiles && (
            <p role="status" className="m-0 text-sm text-ink-muted">
              {t('fbPreparing')}
            </p>
          )}
          <p className="m-0 text-sm text-ink-muted">{t('fbVideoNote')}</p>
          <input
            ref={imageInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            data-testid="fb-image-input"
            onChange={(e) => {
              void addImages(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={videoInput}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            hidden
            data-testid="fb-video-input"
            onChange={(e) => {
              void addVideo(e.target.files);
              e.target.value = '';
            }}
          />
        </fieldset>

        <p className="m-0 rounded-xl bg-surface-2 p-3 text-sm text-ink-muted">{attached}</p>
        <p className="m-0 text-sm text-ink-soft">{t('fbPrivacy')}</p>

        {msg && (
          <p role="alert" className="m-0 rounded-xl border-2 border-line-strong bg-surface-2 p-3 text-[15px] font-bold text-ink">
            {t(msg)}
          </p>
        )}
        {status === 'sending' && (photos.length > 0 || clip) && <progress className="w-full" max={1} value={progress} aria-label={t('fbProgress', { p: Math.round(progress * 100) })} />}

        <button type="button" className={primaryBtn} disabled={!canSend} onClick={() => void send()}>
          <BusyLabel busy={status === 'sending'} label={status === 'error' ? t('fbRetry') : t('fbSend')} busyLabel={t('fbSending')} />
        </button>
      </section>

      <Link to="/gop-y/cua-toi" className={linkBtn + ' justify-center'}>
        {t('fbMine')}
      </Link>
    </ScreenFrame>
  );
}
