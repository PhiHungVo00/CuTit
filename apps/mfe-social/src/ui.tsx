import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from './i18n';

/** Khung màn hình (cùng kiểu mfe-learner: safe-area, cột 560px). `back` = nơi quay lại; không có thì không hiện nút. */
export function ScreenFrame({ title, back, action, children }: { title: string; back?: string; action?: ReactNode; children: ReactNode }) {
  const t = useT();
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh bg-canvas px-4 pb-8 pt-[calc(16px+env(safe-area-inset-top))] font-sans text-ink">
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">
        <header className="flex items-center justify-between gap-2 border-b-2 border-line pb-4">
          <div className="flex min-w-0 items-center gap-2">
            {back && (
              <button type="button" aria-label={t('back')} className={iconBtn} onClick={() => navigate(back)}>
                <span aria-hidden="true">←</span>
              </button>
            )}
            <h1 className="m-0 min-w-0 truncate text-[26px] font-black leading-tight tracking-tight text-heading">{title}</h1>
          </div>
          {action}
        </header>
        {children}
      </div>
    </div>
  );
}

export const card = 'flex flex-col gap-3 rounded-2xl border border-line-strong bg-surface p-4 shadow-card';
export const primaryBtn = 'min-h-12 w-full rounded-xl bg-accent px-4 font-extrabold text-accent-ink disabled:opacity-50';
export const secondaryBtn = 'min-h-12 w-full rounded-xl border border-line-strong bg-surface-2 px-4 font-bold text-ink disabled:opacity-50';
export const linkBtn = 'flex min-h-11 items-center rounded-xl border border-line-strong bg-surface px-3 text-sm font-bold text-ink no-underline';
export const iconBtn = 'inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface font-bold text-ink';
export const input = 'min-h-12 w-full rounded-xl border border-line-strong bg-surface px-3 text-ink';

/** Thông báo trạng thái có chữ (không chỉ báo bằng màu). */
export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error'; children: ReactNode }) {
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={['m-0 rounded-xl px-3 py-2 text-sm', tone === 'error' ? 'bg-surface-2 font-bold text-ink' : 'bg-surface-2 text-ink-soft'].join(' ')}>
      {children}
    </p>
  );
}
