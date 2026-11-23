import React from 'react';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Nhãn cho trình đọc màn hình (công tắc không có chữ riêng). */
  label: string;
  disabled?: boolean;
}

export const Toggle = ({ checked, onChange, label, disabled }: ToggleProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    style={{
      position: 'relative',
      width: 52,
      height: 32,
      flex: 'none',
      borderRadius: 999,
      border: '1px solid var(--ct-line-strong)',
      background: checked ? 'var(--ct-accent)' : 'var(--ct-sunken)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'background var(--ct-motion-base) ease',
      padding: 0,
    }}
  >
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 3,
        left: checked ? 23 : 3,
        width: 24,
        height: 24,
        borderRadius: 999,
        background: checked ? 'var(--ct-accent-ink)' : 'var(--ct-ink-muted)',
        transition: 'left var(--ct-motion-fast) ease',
      }}
    />
  </button>
);
