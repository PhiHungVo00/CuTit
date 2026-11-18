import type { ReactNode } from 'react';

/** Lớp dùng chung của lộ trình (Tailwind + design tokens của packages/ui) */
export const primaryBtn =
  'flex min-h-12 w-full items-center justify-center rounded-xl bg-accent px-4 text-center text-base font-extrabold text-accent-ink no-underline disabled:opacity-40';
export const secondaryBtn =
  'flex min-h-12 w-full items-center justify-center rounded-xl border border-line-strong bg-surface px-4 text-center text-base font-bold text-ink no-underline';
export const card = 'flex flex-col gap-3 rounded-2xl border border-line-strong bg-surface p-4 shadow-card';

/** Khung trang toàn màn hình của các màn lộ trình (cùng kiểu với các MFE khác) */
export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas px-4 pb-8 pt-[calc(16px+env(safe-area-inset-top))] font-sans text-ink">
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">{children}</div>
    </div>
  );
}
