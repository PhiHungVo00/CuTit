import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, elevated = false, style, ...props }) => {
  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        padding: '1.25rem',
        boxShadow: elevated ? '0 4px 6px -1px rgba(0, 0, 0, 0.05)' : 'none',
        ...style
      }}
      {...props}
    >
      {children}
    </div>
  );
};

export const Badge: React.FC<{ children: React.ReactNode; color?: 'indigo' | 'emerald' | 'amber' }> = ({
  children,
  color = 'indigo'
}) => {
  const colorMap = {
    indigo: { bg: '#EEF2FF', text: '#4F46E5' },
    emerald: { bg: '#ECFDF5', text: '#059669' },
    amber: { bg: '#FFFBEB', text: '#D97706' }
  };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.2rem 0.5rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        backgroundColor: colorMap[color].bg,
        color: colorMap[color].text
      }}
    >
      {children}
    </span>
  );
};

export const AgentBlockWrapper: React.FC<{
  title: string;
  badge?: string;
  children: React.ReactNode;
}> = ({ title, badge, children }) => {
  return (
    <Card elevated style={{ margin: '0.75rem 0', borderLeft: '4px solid #6366F1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#1E293B' }}>{title}</h4>
        {badge && <Badge color="indigo">{badge}</Badge>}
      </div>
      <div>{children}</div>
    </Card>
  );
};
