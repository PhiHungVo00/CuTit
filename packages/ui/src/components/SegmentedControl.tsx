import React from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Nhãn nhóm cho trình đọc màn hình. */
  label?: string;
}

export function SegmentedControl<T extends string>({ options, value, onChange, label }: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      style={{
        display: 'inline-flex',
        padding: 3,
        gap: 2,
        borderRadius: 'var(--ct-radius-md)',
        background: 'var(--ct-sunken)',
        border: '1px solid var(--ct-line)',
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            style={{
              minHeight: 40,
              padding: '0 14px',
              borderRadius: 'var(--ct-radius-sm)',
              border: 'none',
              fontFamily: 'inherit',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              background: on ? 'var(--ct-accent)' : 'transparent',
              color: on ? 'var(--ct-accent-ink)' : 'var(--ct-ink-soft)',
              transition: 'background var(--ct-motion-fast) ease',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
