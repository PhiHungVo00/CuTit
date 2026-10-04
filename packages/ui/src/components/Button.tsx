import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  style,
  ...props
}) => {
  const baseStyle: React.CSSProperties = {
    fontFamily: '"Be Vietnam Pro", system-ui, sans-serif',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'all 0.15s ease',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    ...style
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: '#6366F1', color: '#FFFFFF' },
    secondary: { backgroundColor: '#F1F5F9', color: '#0F172A' },
    accent: { backgroundColor: '#10B981', color: '#FFFFFF' },
    outline: { backgroundColor: 'transparent', border: '1px solid #CBD5E1', color: '#334155' }
  };

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: '0.35rem 0.75rem', fontSize: '0.85rem' },
    md: { padding: '0.5rem 1rem', fontSize: '0.95rem' },
    lg: { padding: '0.75rem 1.5rem', fontSize: '1.05rem' }
  };

  return (
    <button style={{ ...baseStyle, ...variantStyles[variant], ...sizeStyles[size] }} {...props}>
      {children}
    </button>
  );
};
