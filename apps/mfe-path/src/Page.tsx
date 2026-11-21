import type { ReactNode } from 'react';
import type { CSSProperties } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

/** Khung trang toàn màn hình của các màn lộ trình (cùng kiểu với các MFE khác) */
export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas px-4 pb-8 pt-[calc(16px+env(safe-area-inset-top))] font-sans text-ink">
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">{children}</div>
    </div>
  );
}

/** Thẻ lộ trình: `Card` chung xếp dọc có khoảng cách */
export const cardStack: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };

/** Nút bấm rộng hết khung dùng cho `Button` chung */
export const fullWidth: CSSProperties = { width: '100%' };

const LINK: Record<'primary' | 'secondary', CSSProperties> = {
  primary: { background: 'var(--ct-accent)', color: 'var(--ct-accent-ink)', border: '1px solid transparent' },
  secondary: { background: 'var(--ct-surface-2)', color: 'var(--ct-ink)', border: '1px solid var(--ct-line-strong)' }
};

/**
 * Liên kết trông như `Button` chung (cùng token, cùng cỡ md): `@vietlearning/ui` chưa có biến thể liên kết,
 * mà điều hướng cần giữ vai trò `link` cho trình đọc màn hình và e2e.
 */
export function LinkButton({ variant = 'primary', style, ...props }: LinkProps & { variant?: 'primary' | 'secondary' }) {
  return (
    <Link
      {...props}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        textDecoration: 'none',
        minHeight: 48,
        width: '100%',
        padding: '0 20px',
        fontWeight: 700,
        fontSize: '1rem',
        borderRadius: 'var(--ct-radius-md)',
        ...LINK[variant],
        ...style
      }}
    />
  );
}
