import { Link } from 'react-router-dom';
import { EmptyState } from '@vietlearning/ui';
import { useUiLanguage } from '@vietlearning/state';

const TEXT = {
  vi: { title: 'Sắp có', body: 'Tính năng này đang được hoàn thiện. Bạn vẫn học bình thường nhé.', back: 'Về trang học' },
  en: { title: 'Coming soon', body: 'This feature is being finished. You can keep learning as usual.', back: 'Back to learning' }
} as const;

/** Chỗ giữ cho `/goi/:callId` và `/tin-nhan/moi`: Task 14/15 chỉ đổi `load` ở routes.tsx. */
export default function SocialSoonRoute() {
  const t = TEXT[useUiLanguage()];
  return (
    <div className="min-h-dvh bg-canvas px-4 pt-[calc(24px+env(safe-area-inset-top))] font-sans text-ink">
      <div className="mx-auto max-w-[560px]">
        <h1 className="sr-only">{t.title}</h1>
        <EmptyState
          mood="suy-nghi"
          title={t.title}
          body={t.body}
          action={
            <Link to="/" className="flex min-h-12 items-center justify-center rounded-xl bg-accent px-4 font-extrabold text-accent-ink no-underline">
              {t.back}
            </Link>
          }
        />
      </div>
    </div>
  );
}
