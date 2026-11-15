import { memo, useId, type KeyboardEvent, type ReactNode } from 'react';

export interface Choice<T extends string | number> {
  id: T;
  label: ReactNode;
}

interface ChoiceGroupProps<T extends string | number> {
  label: string;
  value: T;
  options: readonly Choice<T>[];
  onChange: (value: T) => void;
  /** Số cột của lưới (mặc định = số lựa chọn) */
  columns?: number;
  hint?: ReactNode;
  size?: 'md' | 'sm';
}

const COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5'
};

/**
 * Nhóm lựa chọn một-trong-nhiều (radiogroup):
 * - Mỗi nút cao tối thiểu 44px (chuẩn chạm iOS/Android)
 * - Trình đọc màn hình đọc được nhãn nhóm + trạng thái đã chọn
 * - Phím mũi tên chuyển lựa chọn (roving tabindex)
 */
function ChoiceGroupInner<T extends string | number>({
  label,
  value,
  options,
  onChange,
  columns,
  hint,
  size = 'md'
}: ChoiceGroupProps<T>) {
  const labelId = useId();
  const index = options.findIndex((o) => o.id === value);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = options[(index + delta + options.length) % options.length];
    onChange(next.id);
    const btn = e.currentTarget.querySelector<HTMLButtonElement>(`[data-choice="${String(next.id)}"]`);
    btn?.focus();
  };

  return (
    <div>
      <span id={labelId} className="mb-2 block text-sm font-bold text-ink-soft">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={onKeyDown}
        className={`grid gap-2 ${COLS[columns ?? options.length] ?? 'grid-cols-2'}`}
      >
        {options.map((o) => {
          const active = o.id === value;
          return (
            <button
              key={String(o.id)}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              data-choice={String(o.id)}
              onClick={() => onChange(o.id)}
              className={[
                'flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2 text-center leading-tight transition-colors',
                size === 'sm' ? 'text-sm' : 'text-[15px]',
                active
                  ? 'border-accent bg-accent-soft font-bold text-heading'
                  : 'border-line bg-surface-2 font-medium text-ink-soft active:bg-surface'
              ].join(' ')}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {hint && <div className="mt-1.5 text-sm italic text-ink-muted">{hint}</div>}
    </div>
  );
}

export const ChoiceGroup = memo(ChoiceGroupInner) as typeof ChoiceGroupInner;
