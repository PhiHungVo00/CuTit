import type { ReactNode } from 'react';
import { CuTit, type CuTitMood } from '../mascot/CuTit.js';

export interface EmptyStateProps {
  /** Tư thế Cu Tít: `ngu` rỗng · `buon` lỗi · `suy-nghi` đang tải · `khen` xong hết */
  mood: CuTitMood;
  title: string;
  body?: string;
  /** Nút/liên kết hành động (chỉ một hành động chính) */
  action?: ReactNode;
  /** Cạnh ảnh Cu Tít, px (mặc định 96) */
  size?: number;
  /** `error` => role="alert" (đọc ngay); còn lại role="status" */
  tone?: 'neutral' | 'error';
  /** Mức tiêu đề (mặc định h2, vì h1 là tên màn) */
  as?: 'h2' | 'h3';
}

/**
 * Trạng thái rỗng / lỗi / đang tải có Cu Tít (P1-3). Dùng chung cho mọi MFE; vì đi cùng `CuTit`
 * (ảnh và CSS nạp lười) nên không thêm vào gói đầu.
 */
export function EmptyState({ mood, title, body, action, size = 96, tone = 'neutral', as: Heading = 'h2' }: EmptyStateProps) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className="flex flex-col items-center gap-2 px-2 py-3 text-center">
      <CuTit mood={mood} size={size} />
      <Heading className="m-0 text-lg font-extrabold text-heading">{title}</Heading>
      {body && <p className="m-0 text-[15px] text-ink-soft">{body}</p>}
      {action && <div className="mt-1 flex w-full max-w-[320px] flex-col gap-2">{action}</div>}
    </div>
  );
}
