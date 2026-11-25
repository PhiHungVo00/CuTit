import { Button, CuTit } from '@vietlearning/ui';
import { useUiLanguage } from '@vietlearning/state';
import type { ApkCard } from './channel';
import { updateMessages, type UpdateErrorKey } from './updateI18n';

export type PromptKind = 'soft' | 'downloading' | 'ready' | 'webReload' | 'error' | 'apk';

export interface UpdatePromptProps {
  kind: PromptKind;
  version?: string;
  notes?: { vi: string; en: string } | null;
  percent?: number;
  errorKey?: UpdateErrorKey | null;
  /** Chỉ kind='apk' */
  card?: ApkCard;
  /** Nút chính (một nút duy nhất) */
  onPrimary?: () => void;
  onLater?: () => void;
}

const card: React.CSSProperties = {
  position: 'fixed',
  zIndex: 45,
  left: 'calc(12px + var(--safe-left))',
  right: 'calc(12px + var(--safe-right))',
  // Trên thanh tab và trên bong bóng Cu Tít (60px + lề 12px) để không che nhau
  bottom: 'calc(var(--tabbar-h) + var(--safe-bottom) + 84px)',
  display: 'flex',
  gap: 12,
  alignItems: 'flex-start',
  padding: 14,
  border: '1px solid var(--ct-line)',
  borderRadius: 20,
  background: 'var(--ct-surface)',
  color: 'var(--ct-ink)',
  boxShadow: '0 6px 18px rgb(0 0 0 / 0.22)',
  maxWidth: 480,
  marginInline: 'auto'
};
const tap: React.CSSProperties = { minHeight: 44, minWidth: 44 };

/**
 * Thẻ nhắc cập nhật mềm (spec 5.5): nổi trên thanh tab, `role="status"`, có Cu Tít nhỏ; MỘT nút chính + "Để sau".
 * Ghi chú là chữ thuần: React escape nên `<b>` hiện nguyên văn.
 */
export function UpdatePrompt({ kind, version, notes, percent, errorKey, card: apk, onPrimary, onLater }: UpdatePromptProps) {
  const t = updateMessages.useT();
  const lang = useUiLanguage();
  const run = (f: () => unknown) => () => void f();
  // Thẻ APK: tiêu đề + (tùy chọn) nội dung + tối đa 2 nút (nút phụ rồi nút chính)
  const a = apk
    ? apk.kind === 'ready'
      ? { title: t('apkReadyTitle', { version: apk.version }), body: null, secondary: null, primary: { label: t('apkInstall'), run: run(apk.install) }, later: true }
      : apk.kind === 'metered'
        ? {
            title: t('apkMeteredAsk', { size: apk.sizeMb }),
            body: null,
            secondary: { label: t('apkWaitWifi'), run: apk.waitWifi },
            primary: { label: t('apkMeteredYes'), run: run(apk.downloadNow) },
            later: false
          }
        : apk.kind === 'allow'
          ? { title: t('apkAllowTitle'), body: t('apkAllowBody'), secondary: null, primary: { label: t('apkAllowAction'), run: run(apk.openSettings) }, later: false }
          : {
              title: t('apkFailed'),
              body: null,
              secondary: apk.openPage ? { label: t('apkOpenPage'), run: apk.openPage } : null,
              primary: { label: t('softUpdate'), run: run(apk.retry) },
              later: false
            }
    : null;
  const title =
    a
      ? a.title
      : kind === 'soft'
      ? t('softTitle', { version: version ?? '' })
      : kind === 'ready'
        ? t('restartTitle')
        : kind === 'webReload'
          ? t('webReloadTitle')
          : kind === 'downloading'
            ? t('downloading', { percent: percent ?? 0 })
            : t(errorKey ?? 'openStoreFailed');
  const primary =
    kind === 'soft' ? t('softUpdate') : kind === 'ready' ? t('restartAction') : kind === 'webReload' ? t('webReloadAction') : null;
  const note = kind === 'soft' && notes ? (lang === 'en' ? notes.en : notes.vi) : null;
  return (
    <section role="status" aria-live="polite" className="update-prompt" style={card}>
      <CuTit mood={kind === 'error' ? 'buon' : 'chao'} size={44} animate={false} alt="" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: 'block', fontSize: '1rem', color: 'var(--ct-heading)' }}>{title}</strong>
        {a?.body && <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'var(--ct-ink-soft)' }}>{a.body}</p>}
        {note && (
          <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'var(--ct-ink-soft)' }}>
            <span style={{ fontWeight: 700 }}>{t('whatsNew')}: </span>
            {note}
          </p>
        )}
        {kind === 'downloading' && (
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? 0}
            aria-label={title}
            style={{ marginTop: 8, height: 6, borderRadius: 3, background: 'var(--ct-surface-2)', overflow: 'hidden' }}
          >
            <div style={{ width: `${percent ?? 0}%`, height: '100%', background: 'var(--ct-accent)' }} />
          </div>
        )}
        {a ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {a.later && onLater && (
              <Button variant="ghost" size="sm" style={tap} onClick={onLater}>
                {t('softLater')}
              </Button>
            )}
            {a.secondary && (
              <Button variant="ghost" size="sm" style={tap} onClick={a.secondary.run}>
                {a.secondary.label}
              </Button>
            )}
            <Button size="sm" style={tap} onClick={a.primary.run}>
              {a.primary.label}
            </Button>
          </div>
        ) : (onPrimary && primary) || onLater ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {onLater && (
              <Button variant="ghost" size="sm" style={tap} onClick={onLater}>
                {t('softLater')}
              </Button>
            )}
            {onPrimary && primary && (
              <Button size="sm" style={tap} onClick={onPrimary}>
                {primary}
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default UpdatePrompt;

/** Dải nhỏ khi offline + cần cập nhật: không chặn, bài đã tải vẫn học được */
export function ForcedOfflineBanner() {
  const t = updateMessages.useT();
  return (
    <div className="offline-banner" role="status">
      {t('forcedOffline')}
    </div>
  );
}
