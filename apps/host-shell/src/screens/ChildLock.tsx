import { Link } from 'react-router-dom';
import { defineMessages } from '@vietlearning/state';

// Chữ riêng của màn khóa (nhỏ) — từ điển lớn của mục Gia đình chỉ nạp khi mở mục đó
const { useT } = defineMessages(
  {
    lockTitle: 'Phần này chưa mở cho bé',
    lockChat: 'Hồ sơ của bé không có trò chuyện tự do với AI. Bé thử nhập vai theo kịch bản cùng Cu Tít nhé!',
    toRoleplay: 'Đi nhập vai',
    toFamily: 'Mục Gia đình (bố mẹ)'
  },
  {
    lockTitle: 'Not open for kids yet',
    lockChat: 'Kids’ profiles don’t have free chat with the AI. Try a scripted role-play with Cu Tít instead!',
    toRoleplay: 'Go to role-play',
    toFamily: 'Family (for parents)'
  }
);

/**
 * GĐ4b — Màn khóa thân thiện cho hồ sơ trẻ (lớp ngoài; Gateway vẫn chặn ở server).
 * Chỉ dùng trong ChatRoute (gọi thoại chuyển về đây; camera có màn khóa riêng) để không thành chunk dùng chung.
 */
export function ChildLock() {
  const t = useT();
  return (
    <div className="min-h-dvh bg-canvas px-4 pb-8 pt-[calc(16px+env(safe-area-inset-top))] font-sans text-ink">
      <section role="status" data-testid="child-lock" className="mx-auto flex max-w-[560px] flex-col gap-3 rounded-2xl border border-line-strong bg-surface p-4 shadow-card">
        <p className="m-0 text-center text-5xl" aria-hidden="true">
          🧸
        </p>
        <h1 className="m-0 text-center text-lg font-extrabold text-ink">{t('lockTitle')}</h1>
        <p className="m-0 text-[15px] text-ink-soft">{t('lockChat')}</p>
        <Link to="/nhap-vai" className="flex min-h-12 w-full items-center justify-center rounded-xl bg-accent px-4 font-extrabold text-accent-ink">
          {t('toRoleplay')}
        </Link>
        <Link to="/tuy-chinh?muc=gia-dinh" className="flex min-h-12 w-full items-center justify-center rounded-xl border border-line-strong bg-surface-2 px-4 font-bold text-ink">
          {t('toFamily')}
        </Link>
      </section>
    </div>
  );
}
