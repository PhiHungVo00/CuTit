import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  /** Đang xử lý: khóa nút và báo `aria-busy`. */
  busy?: boolean;
}

const variants: Record<NonNullable<ButtonProps['variant']>, React.CSSProperties> = {
  primary: { background: 'var(--ct-accent)', color: 'var(--ct-accent-ink)', border: '1px solid transparent' },
  secondary: { background: 'var(--ct-surface-2)', color: 'var(--ct-ink)', border: '1px solid var(--ct-line-strong)' },
  ghost: { background: 'transparent', color: 'var(--ct-ink)', border: '1px solid transparent' },
  danger: { background: 'var(--ct-danger)', color: '#ffffff', border: '1px solid transparent' },
};

const sizes: Record<NonNullable<ButtonProps['size']>, React.CSSProperties> = {
  sm: { minHeight: 40, padding: '0 14px', fontSize: '0.9rem' },
  md: { minHeight: 48, padding: '0 20px', fontSize: '1rem' },
  lg: { minHeight: 56, padding: '0 28px', fontSize: '1.1rem' },
};

export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  busy = false,
  disabled,
  style,
  type = 'button',
  ...props
}: ButtonProps) => (
  <button
    type={type}
    {...props}
    disabled={busy || disabled}
    aria-busy={busy ? true : undefined}
    style={{
      fontFamily: 'inherit',
      fontWeight: 700,
      borderRadius: 'var(--ct-radius-md)',
      cursor: busy || disabled ? 'not-allowed' : 'pointer',
      opacity: busy || disabled ? 0.65 : 1,
      transition: 'opacity var(--ct-motion-fast) ease, transform var(--ct-motion-fast) ease',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.5rem',
      ...variants[variant],
      ...sizes[size],
      ...style,
    }}
  >
    {children}
  </button>
);
