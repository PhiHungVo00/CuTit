import { useEffect, useRef } from 'react';
import { Button, CuTit } from '@vietlearning/ui';
import { updateMessages, type UpdateErrorKey } from './updateI18n';

export interface ForcedUpdateProps {
  onUpdate: () => void;
  errorKey?: UpdateErrorKey | null;
}

/**
 * Màn "Cần cập nhật để học tiếp" (spec 5.5, bản có mạng): che toàn bộ, `role="alertdialog"`, focus vào tiêu đề,
 * KHÔNG có nút đóng, MỘT nút chính. Phần còn lại của trang bị `inert` để bàn phím/trình đọc màn hình không lọt ra.
 */
export function ForcedUpdate({ onUpdate, errorKey }: ForcedUpdateProps) {
  const t = updateMessages.useT();
  const root = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = root.current;
    const others = [...(el?.parentElement?.children ?? [])].filter((c) => c !== el && !c.hasAttribute('inert'));
    others.forEach((c) => c.setAttribute('inert', ''));
    title.current?.focus();
    return () => others.forEach((c) => c.removeAttribute('inert'));
  }, []);

  return (
    <div
      ref={root}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="update-forced-title"
      aria-describedby="update-forced-body"
      className="update-forced"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 'calc(24px + var(--safe-top)) 24px calc(24px + var(--safe-bottom))',
        textAlign: 'center',
        background: 'var(--ct-canvas)',
        color: 'var(--ct-ink)',
        overflowY: 'auto'
      }}
    >
      <CuTit mood="dong-vien" size={120} alt="" />
      <h1 id="update-forced-title" ref={title} tabIndex={-1} style={{ margin: 0, fontSize: '1.4rem', color: 'var(--ct-heading)', outline: 'none' }}>
        {t('forcedTitle')}
      </h1>
      <p id="update-forced-body" style={{ margin: 0, maxWidth: 340, color: 'var(--ct-ink-soft)' }}>
        {t('forcedBody')}
      </p>
      {errorKey && (
        <p role="alert" style={{ margin: 0, maxWidth: 340, color: 'var(--ct-danger)' }}>
          {t(errorKey)}
        </p>
      )}
      <Button size="lg" onClick={onUpdate} style={{ minHeight: 52, minWidth: 220 }}>
        {t('forcedAction')}
      </Button>
    </div>
  );
}

export default ForcedUpdate;
