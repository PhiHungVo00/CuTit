import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
}

export const Card = ({ children, elevated = false, style, ...props }: CardProps) => (
  <div
    {...props}
    style={{
      background: 'var(--ct-surface)',
      color: 'var(--ct-ink)',
      borderRadius: 'var(--ct-radius-lg)',
      border: '1px solid var(--ct-line)',
      padding: '1.25rem',
      boxShadow: elevated ? 'var(--ct-shadow-card)' : 'none',
      ...style,
    }}
  >
    {children}
  </div>
);

export const Badge = ({ children, tone = 'accent' }: { children: React.ReactNode; tone?: 'accent' | 'gold' | 'danger' }) => {
  const map = {
    accent: { bg: 'var(--ct-accent-soft)', fg: 'var(--ct-chip3-ink)' },
    gold: { bg: 'var(--ct-chip2-bg)', fg: 'var(--ct-chip2-ink)' },
    danger: { bg: 'var(--ct-danger-soft)', fg: 'var(--ct-danger-ink)' },
  }[tone];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.2rem 0.6rem',
        borderRadius: 999,
        fontSize: '0.75rem',
        fontWeight: 600,
        background: map.bg,
        color: map.fg,
      }}
    >
      {children}
    </span>
  );
};

export const AgentBlockWrapper = ({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) => (
  <Card elevated style={{ margin: '0.75rem 0', borderLeft: '4px solid var(--ct-gold)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
      <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--ct-heading)' }}>{title}</h4>
      {badge && <Badge tone="gold">{badge}</Badge>}
    </div>
    <div>{children}</div>
  </Card>
);
