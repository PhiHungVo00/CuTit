import type { ReactNode } from 'react';

/** Khung màn hình chung của mfe-learner (cùng kiểu với các màn hình khác: safe-area, cột 560px). */
export function ScreenFrame({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas px-4 pb-8 pt-[calc(16px+env(safe-area-inset-top))] font-sans text-ink">
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">
        <header className="flex items-center justify-between gap-2 border-b-2 border-line pb-4">
          <h1 className="m-0 text-[26px] font-black leading-tight tracking-tight text-heading">{title}</h1>
          {action}
        </header>
        {children}
      </div>
    </div>
  );
}

export const card = 'flex flex-col gap-3 rounded-2xl border border-line-strong bg-surface p-4 shadow-card';
export const primaryBtn = 'min-h-12 w-full rounded-xl bg-accent px-4 font-extrabold text-accent-ink disabled:opacity-50';
export const secondaryBtn = 'min-h-12 w-full rounded-xl border border-line-strong bg-surface-2 px-4 font-bold text-ink disabled:opacity-50';

/** Vòng quay nhỏ cho nút đang chờ server (ẩn với trình đọc màn hình; chữ đi kèm nói “đang…”) */
export function Spinner() {
  return <span aria-hidden="true" className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px] motion-reduce:animate-none" />;
}

/** Nội dung nút: khi `busy` thì hiện vòng quay + chữ đang xử lý */
export function BusyLabel({ busy, label, busyLabel }: { busy: boolean; label: string; busyLabel: string }) {
  return busy ? (
    <span className="inline-flex items-center justify-center gap-2">
      <Spinner />
      {busyLabel}
    </span>
  ) : (
    <>{label}</>
  );
}
export const linkBtn = 'flex min-h-11 items-center rounded-xl border border-line-strong bg-surface px-3 text-sm font-bold text-ink no-underline';

/** Nhóm lựa chọn một-trong-nhiều dạng thẻ lớn (radio thật, chạm cả nhãn). */
export function ChoiceGroup<T extends string>({
  name,
  legend,
  value,
  options,
  onChange
}: {
  name: string;
  legend: string;
  value: T | null;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 p-0 text-[15px] font-bold text-ink-soft">{legend}</legend>
      {options.map((o) => (
        <label
          key={o.value}
          className={[
            'flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2',
            value === o.value ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2'
          ].join(' ')}
        >
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="size-5 accent-[var(--color-accent)]" />
          <span className="flex flex-col">
            <span className="font-bold text-ink">{o.label}</span>
            {o.hint && <span className="text-sm text-ink-muted">{o.hint}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
