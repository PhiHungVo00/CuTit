import React from 'react';
import { Icon } from '../icons/Icon.js';
import type { IconName } from '../icons/paths.js';

export interface ListRowProps {
  icon?: IconName;
  label: string;
  hint?: string;
  /** Có `to` ⇒ render <a href>; app tự chặn mặc định và điều hướng bằng router nếu cần. */
  to?: string;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  /** Phần cuối hàng (vd. <Toggle/>). Mặc định có mũi tên khi bấm được. */
  trailing?: React.ReactNode;
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  minHeight: 56,
  width: '100%',
  padding: '10px 16px',
  boxSizing: 'border-box',
  background: 'var(--ct-surface)',
  color: 'var(--ct-ink)',
  border: 'none',
  borderBottom: '1px solid var(--ct-line)',
  font: 'inherit',
  textAlign: 'left',
  textDecoration: 'none',
};

export const ListRow = ({ icon, label, hint, to, onClick, trailing }: ListRowProps) => {
  const interactive = Boolean(to || onClick);
  const body = (
    <>
      {icon ? <Icon name={icon} size={22} /> : null}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600 }}>{label}</span>
        {hint ? <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--ct-ink-muted)' }}>{hint}</span> : null}
      </span>
      {trailing ?? (interactive ? <Icon name="mui-ten-phai" size={20} /> : null)}
    </>
  );
  if (to) {
    return (
      <a href={to} onClick={onClick} style={{ ...rowStyle, cursor: 'pointer' }}>
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={{ ...rowStyle, cursor: 'pointer' }}>
        {body}
      </button>
    );
  }
  return <div style={rowStyle}>{body}</div>;
};
