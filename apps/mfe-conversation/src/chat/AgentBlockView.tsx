import { Link } from 'react-router-dom';
import type { AgentUIBlock } from '@vietlearning/contracts/api';
import { useT } from '../i18n';

/**
 * Dựng Agent UI Block thành thẻ CHỈ CÓ CHỮ (không bao giờ render HTML từ LLM — Nguyên tắc 6).
 * Đường dẫn cố định theo loại block, KHÔNG lấy URL từ payload; chuyển màn hình bằng URL (Nguyên tắc 7).
 */
const META: Record<AgentUIBlock['type'], { icon: string; to: string; field: string }> = {
  culture_pill: { icon: '📜', to: '/van-hoa', field: 'tip' },
  honorific_card: { icon: '🏮', to: '/xung-ho', field: 'note' },
  pitch_visualizer: { icon: '🎙️', to: '/phat-am', field: 'note' },
  adaptive_drill: { icon: '🧩', to: '/luyen-tap', field: 'note' },
  dialect_switch: { icon: '🗺️', to: '/phuong-ngu', field: 'note' }
};

export function AgentBlockView({ block }: { block: AgentUIBlock }) {
  const t = useT();
  const meta = META[block.type];
  const raw = block.payload[meta.field];
  const text = typeof raw === 'string' ? raw : null;
  return (
    <aside className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-3" aria-label={block.title}>
      <p className="m-0 font-bold text-ink">
        <span aria-hidden="true">{meta.icon} </span>
        {block.title}
      </p>
      {text && <p className="m-0 text-[15px] text-ink-soft">{text}</p>}
      <Link to={meta.to} className="flex min-h-11 items-center self-start rounded-xl border border-line-strong bg-surface px-3 text-sm font-bold text-ink no-underline">
        {t(`cta.${block.type}`)} →
      </Link>
    </aside>
  );
}
